/* Suche — globale Suche über alle archivierten Aufträge.

   Backend: /api/search (Phase 1) — pg_trgm GIN indexes auf
   file_name + parsed::text, fuzzy match auf FNSKU/SKU/EAN/
   Sendungsnummer. Antwort enthält `matched_field` (welches Feld
   getroffen wurde) — wir zeigen es als MatchBadge in jeder Zeile.

   Phase-3 Funktionen:
     • Debounced Query (250 ms) — kein Spam an die DB beim Tippen
     • Datums-Range (von/bis) optional
     • Client-side Typ-Filter (Alle / FNSKU / SKU / EAN / SN / Datei)
       — der Server gibt schon das matched_field zurück, also einfach
       lokal filtern statt einen weiteren Backend-Parameter einzuführen
     • "Mehr laden" Pagination (offset-basiert, 50 pro Seite)
     • Detail-Modal beim Klick auf eine Zeile
     • Optionale `initialQuery` über props — gefüllt aus CommandPalette
       wenn man dort Enter auf einer Trefferzeile drückt
*/

import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchAuftraege, getAuftrag } from '../marathonApi.js';
import { useDebounced } from '../hooks/useDebounced.js';
import {
  Page, Topbar, Card, Eyebrow, PageH1, Lead,
  Button, Badge, EmptyState, T,
} from '../components/ui.jsx';

const PAGE_SIZE = 50;

const TYPE_FILTERS = [
  { id: 'all',            label: 'Alle' },
  { id: 'fnsku',          label: 'FNSKU' },
  { id: 'sku',            label: 'SKU' },
  { id: 'ean',            label: 'EAN' },
  { id: 'sendungsnummer', label: 'Sendungsnr.' },
  { id: 'file_name',      label: 'Datei' },
];

export default function SucheScreen({ initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState(null);

  /* If the parent (App.jsx) supplies a new initialQuery, sync it once.
     Don't sync on every render — that would clobber the user's edits. */
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      setOffset(0);
    }
  }, [initialQuery]);

  const debounced = useDebounced(query, 250);
  const trimmed = debounced.trim();
  const queryEnabled = trimmed.length >= 2;

  /* Reset pagination whenever the filters change. We watch the values
     that go into the URL (debounced query, dates) — the type filter is
     client-side and doesn't need a refetch. */
  useEffect(() => { setOffset(0); }, [trimmed, from, to]);

  const searchQ = useQuery({
    queryKey: ['search', trimmed, from, to, offset],
    queryFn:  () => searchAuftraege({
      q: trimmed,
      from: from || undefined,
      to:   to   || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,  // keep showing previous list while next page loads
    staleTime: 30_000,
  });

  const allItems = searchQ.data?.items || [];
  const total = searchQ.data?.total || 0;

  /* Client-side type filter — server returns ALL matches; we only
     narrow by which field hit. */
  const items = useMemo(() => {
    if (typeFilter === 'all') return allItems;
    return allItems.filter((it) => it.matchedField === typeFilter);
  }, [allItems, typeFilter]);

  const showLoadMore = queryEnabled && (offset + allItems.length < total);

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Suche' }]}
        right={
          queryEnabled && (
            <span style={{ fontSize: 12, color: T.text.subtle, fontVariantNumeric: 'tabular-nums' }}>
              {searchQ.isFetching ? 'lädt…' : `${total} Treffer`}
            </span>
          )
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 32px 80px' }}>
        <section style={{ marginBottom: 24 }}>
          <Eyebrow>Globale Suche</Eyebrow>
          <PageH1>Aufträge finden</PageH1>
          <Lead>
            Suche nach FNSKU, SKU, EAN, Sendungsnummer oder Dateiname über alle
            archivierten Aufträge. Tippfehler sind erlaubt — der Index toleriert
            kleine Abweichungen.
          </Lead>
        </section>

        {/* Search input */}
        <section style={{ marginBottom: 14 }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="z. B. X0AB1234CD oder FBA15ABC123XYZ"
            loading={searchQ.isFetching && queryEnabled}
          />
        </section>

        {/* Filter row: type segments + date range */}
        <section style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <SegmentBar
            value={typeFilter}
            options={TYPE_FILTERS}
            onChange={setTypeFilter}
          />
          <span style={{ flex: 1, minWidth: 12 }} />
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </section>

        {/* Results */}
        {!queryEnabled && (
          <EmptyState
            icon={<IconSearch />}
            title="Tippe min. 2 Zeichen, um zu suchen"
            description="Die Suche erfasst alle abgeschlossenen, aktiven und Warteschlangen-Aufträge — auch nach Tippfehlern."
          />
        )}

        {queryEnabled && searchQ.isError && (
          <Card padding={20} style={{ background: T.status.danger.bg, borderColor: T.status.danger.border }}>
            <span style={{ fontSize: 13, color: T.status.danger.text, fontWeight: 500 }}>
              Suchfehler: {searchQ.error?.message || 'Backend-Fehler'}
            </span>
          </Card>
        )}

        {queryEnabled && !searchQ.isError && items.length === 0 && !searchQ.isFetching && (
          <EmptyState
            icon={<IconNoMatch />}
            title={typeFilter === 'all'
              ? `Keine Treffer für „${trimmed}"`
              : `Keine Treffer im Filter „${TYPE_FILTERS.find((t) => t.id === typeFilter)?.label}"`}
            description={typeFilter === 'all'
              ? 'Versuche eine andere Schreibweise oder erweitere den Datumsbereich.'
              : 'Wechsle den Typ-Filter auf „Alle", um alle Treffer zu sehen.'}
          />
        )}

        {queryEnabled && items.length > 0 && (
          <section>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={tableHeader}>
                <span style={{ flex: '0 0 48px' }}>Typ</span>
                <span style={{ flex: '1 1 280px' }}>FBA / Datei</span>
                <span style={{ flex: '0 0 90px' }}>Pal / Art</span>
                <span style={{ flex: '0 0 130px' }}>Operator</span>
                <span style={{ flex: '0 0 100px' }}>Status</span>
                <span style={{ flex: '0 0 130px' }}>Erstellt</span>
              </div>
              {items.map((hit, i) => (
                <ResultRow
                  key={hit.id}
                  hit={hit}
                  isLast={i === items.length - 1}
                  onClick={() => setOpenId(hit.id)}
                />
              ))}
            </Card>

            {showLoadMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <Button
                  variant="ghost"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={searchQ.isFetching}
                >
                  {searchQ.isFetching ? 'Lädt…' : `Weitere ${Math.min(PAGE_SIZE, total - (offset + allItems.length))} laden`}
                </Button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Detail modal */}
      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function SearchInput({ value, onChange, placeholder, loading }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 18px',
      height: 52,
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      boxShadow: T.shadow.card,
    }}>
      <span style={{ color: T.text.subtle, display: 'inline-flex' }}>
        <IconSearch />
      </span>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: 0,
          outline: 0,
          fontSize: 15,
          fontWeight: 500,
          color: T.text.primary,
          background: 'transparent',
          fontFamily: T.font.ui,
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          title="Eingabe löschen"
          style={{
            width: 22, height: 22,
            borderRadius: '50%',
            background: T.bg.surface3,
            border: 0,
            color: T.text.subtle,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {loading && <Spinner />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function SegmentBar({ value, options, onChange }) {
  return (
    <div style={{
      display: 'inline-flex',
      padding: 3,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
    }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: '6px 12px',
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              color: active ? T.text.primary : T.text.subtle,
              background: active ? T.bg.surface : 'transparent',
              border: 0,
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              boxShadow: active ? T.shadow.card : 'none',
              transition: 'all 120ms',
              fontFamily: T.font.ui,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function DateRange({ from, to, onFrom, onTo }) {
  const inputStyle = {
    height: 30,
    padding: '0 8px',
    fontSize: 12.5,
    fontFamily: T.font.ui,
    color: T.text.primary,
    background: T.bg.surface,
    border: `1px solid ${T.border.primary}`,
    borderRadius: T.radius.sm,
    outline: 'none',
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11.5, color: T.text.subtle, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Datum
      </span>
      <input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        style={inputStyle}
      />
      <span style={{ fontSize: 12, color: T.text.faint }}>—</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        style={inputStyle}
      />
      {(from || to) && (
        <button
          onClick={() => { onFrom(''); onTo(''); }}
          title="Datums-Filter zurücksetzen"
          style={{
            border: 0,
            background: 'transparent',
            color: T.text.faint,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function ResultRow({ hit, isLast, onClick }) {
  const finished = hit.finishedAt
    ? formatTimestamp(hit.finishedAt)
    : formatTimestamp(hit.createdAt);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
        cursor: 'pointer',
        background: T.bg.surface,
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.bg.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.bg.surface; }}
    >
      <span style={{ flex: '0 0 48px', display: 'flex', alignItems: 'center' }}>
        <MatchBadge field={hit.matchedField} />
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
          {hit.fbaCode || hit.fileName}
        </div>
        <div style={{
          fontSize: 11.5,
          color: T.text.subtle,
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {hit.matchedValue && hit.matchedField !== 'sendungsnummer' && hit.matchedField !== 'file_name'
            ? <span style={{ color: T.accent.text, fontFamily: T.font.mono }}>{hit.matchedField}: {hit.matchedValue}</span>
            : hit.fileName}
        </div>
      </div>

      <span style={{
        flex: '0 0 90px',
        fontSize: 13,
        color: T.text.secondary,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {hit.palletCount} / {hit.articleCount}
      </span>

      <span style={{
        flex: '0 0 130px',
        fontSize: 12.5,
        color: T.text.subtle,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {hit.assignedToUserName || '—'}
      </span>

      <span style={{ flex: '0 0 100px' }}>
        <StatusBadge status={hit.status} />
      </span>

      <span style={{
        flex: '0 0 130px',
        fontSize: 12,
        color: T.text.subtle,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {finished}
      </span>
    </div>
  );
}

function MatchBadge({ field }) {
  const map = {
    fnsku: 'FNSKU', sku: 'SKU', ean: 'EAN',
    sendungsnummer: 'SN', file_name: 'FILE',
  };
  const label = map[field] || '·';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 38,
      padding: '3px 6px',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: '0.04em',
      color: T.accent.text,
      background: T.accent.bg,
      border: `1px solid ${T.accent.border}`,
      borderRadius: 4,
      fontFamily: T.font.mono,
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed:  { tone: 'success', label: 'Fertig' },
    in_progress:{ tone: 'warn',    label: 'Aktiv' },
    queued:     { tone: 'neutral', label: 'Queue' },
    error:      { tone: 'danger',  label: 'Fehler' },
  };
  const cfg = map[status] || { tone: 'neutral', label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/* ════════════════════════════════════════════════════════════════════════
   DETAIL MODAL — lazy fetch full Auftrag, show meta + pallet timings +
   articles list. Reuses the same data shape as Historie ExpandedDetail
   but inline (compact card) instead of an expand-row.
   ════════════════════════════════════════════════════════════════════════ */
function DetailModal({ id, onClose }) {
  const detailQ = useQuery({
    queryKey: ['auftrag', id],
    queryFn: () => getAuftrag(id),
    staleTime: 60_000,
  });

  /* Esc closes — listener on document for the lifetime of the modal. */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const a = detailQ.data;
  const articles = useMemo(() => {
    const pallets = a?.parsed?.pallets || [];
    return pallets.flatMap((p) =>
      p.items.map((it, i) => ({
        palletId: p.id,
        itemIdx: i,
        sku: it.sku,
        fnsku: it.fnsku,
        ean: it.ean,
        title: it.title,
        units: it.units,
        useItem: it.useItem,
      })),
    );
  }, [a]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(17, 24, 39, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 'min(8vh, 80px)',
        paddingBottom: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(92vw, 880px)',
          maxHeight: 'calc(100vh - 120px)',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 14,
          boxShadow: T.shadow.modal,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: T.font.ui,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderBottom: `1px solid ${T.border.primary}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              color: T.text.subtle,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 2,
            }}>
              Auftrag
            </div>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 15,
              fontWeight: 600,
              color: T.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {detailQ.isLoading ? 'lädt…' : (a?.fbaCode || a?.fileName || '—')}
            </div>
          </div>
          {a && <StatusBadge status={a.status} />}
          <button
            onClick={onClose}
            title="Schließen (Esc)"
            style={{
              width: 32, height: 32,
              border: 0,
              background: T.bg.surface2,
              borderRadius: '50%',
              color: T.text.subtle,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {detailQ.isLoading && (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: T.text.faint }}>
              Lädt…
            </div>
          )}

          {detailQ.isError && (
            <div style={{
              padding: 14,
              background: T.status.danger.bg,
              border: `1px solid ${T.status.danger.border}`,
              borderRadius: T.radius.md,
              color: T.status.danger.text,
              fontSize: 13,
            }}>
              Konnte Auftrag nicht laden: {detailQ.error?.message || 'Fehler'}
            </div>
          )}

          {a && (
            <>
              {/* Meta grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 20,
              }}>
                <MetaCell label="Datei" value={a.fileName} mono />
                <MetaCell label="Operator" value={a.assignedToUserName || '—'} />
                <MetaCell label="Paletten" value={a.palletCount} />
                <MetaCell label="Artikel" value={a.articleCount} />
                <MetaCell label="Erstellt" value={formatTimestamp(a.createdAt)} />
                <MetaCell label="Gestartet" value={a.startedAt ? formatTimestamp(a.startedAt) : '—'} />
                <MetaCell label="Beendet" value={a.finishedAt ? formatTimestamp(a.finishedAt) : '—'} />
                <MetaCell label="Dauer" value={a.durationSec ? formatDurationShort(a.durationSec) : '—'} mono />
              </div>

              {/* Pallet timings */}
              {Object.keys(a.palletTimings || {}).length > 0 && (
                <>
                  <div style={sectionLabel}>Palettenzeiten</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                    {Object.entries(a.palletTimings).map(([pid, t]) => {
                      const dur = t.startedAt && t.finishedAt
                        ? Math.round((t.finishedAt - t.startedAt) / 1000) : null;
                      return (
                        <span key={pid} style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          background: T.bg.surface2,
                          border: `1px solid ${T.border.primary}`,
                          borderRadius: T.radius.md,
                          fontFamily: T.font.mono,
                          fontSize: 11.5,
                          color: T.text.secondary,
                        }}>
                          <span style={{ color: T.text.primary, fontWeight: 500 }}>{pid}</span>
                          <span style={{ color: T.text.faint }}>·</span>
                          <span style={{ color: T.accent.main, fontWeight: 500 }}>
                            {dur != null ? formatMmSs(dur) : '—'}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Articles */}
              <div style={sectionLabel}>Artikel ({articles.length})</div>
              <div style={{
                border: `1px solid ${T.border.primary}`,
                background: T.bg.surface,
                borderRadius: T.radius.md,
                overflow: 'hidden',
              }}>
                <div style={articlesHeader}>
                  <span>Palette</span>
                  <span>Name</span>
                  <span>Code</span>
                  <span>Use-Item</span>
                  <span style={{ textAlign: 'right' }}>Menge</span>
                </div>
                {articles.slice(0, 200).map((it, j) => (
                  <div key={j} style={{
                    ...articlesRow,
                    borderBottom: j < articles.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
                  }}>
                    <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.faint }}>
                      {it.palletId}
                    </span>
                    <span style={{ color: T.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title || '—'}
                    </span>
                    <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.fnsku || it.sku || it.ean || '—'}
                    </span>
                    <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.useItem || '—'}
                    </span>
                    <span style={{ fontWeight: 600, color: T.text.primary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {it.units || 0}
                    </span>
                  </div>
                ))}
                {articles.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: T.text.faint }}>
                    Keine Artikel-Daten gespeichert.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 500, color: T.text.subtle, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? T.font.mono : T.font.ui,
        fontSize: 13,
        fontWeight: 500,
        color: T.text.primary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }} title={String(value)}>
        {value}
      </div>
    </div>
  );
}

/* ─── Icons + helpers ──────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconNoMatch() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: `2px solid ${T.border.primary}`,
      borderTopColor: T.accent.main,
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'mp-spin 600ms linear infinite',
    }}>
      <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

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

const sectionLabel = {
  fontSize: 11.5,
  fontWeight: 600,
  color: T.text.subtle,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 10,
};

const articlesHeader = {
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
};

const articlesRow = {
  display: 'grid',
  gridTemplateColumns: '70px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
  padding: '8px 14px',
  fontSize: 12.5,
  color: T.text.secondary,
  alignItems: 'center',
};

function formatTimestamp(input) {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${h}:${m}`;
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
