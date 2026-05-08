/* Suche v2 — «Command Search».

   Magazine-spread design (matches Upload / Pruefen / Focus / Live /
   Historie / Warteschlange / Einstellungen):
     • Eyebrow `Globale Suche · pg_trgm Fuzzy Index` + clamp(36–52) H1
     • Hero search input — 64px tall, mono-text, `/` hotkey badge
     • Empty-state revolution — Recent (LRU) + Saved (bookmarks) +
       Tipp pane, replaces the «type 2 chars» placeholder
     • Insights strip after results — Treffer · Aktiv · Fertig · Queue ·
       Fehler + matchedField stacked-bar + date span
     • Date-presets (Heute / Woche / Monat / Alle) augment the manual
       date pickers
     • Card-row v2 with breathing room and hit-highlight on the
       matched substring
     • DetailModal — magazine-spread header, 4-col meta grid, Pallet-
       Timings Gantt (level-coloured bars), articles list, copy/jump
       actions, Esc + click-outside close
     • Keyboard cockpit — `/` focus, `j/k` navigate, ⏎ open, `c` copy,
       Esc close

   Backend unchanged — uses /api/search and /api/auftraege/{id}.
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchAuftraege, getAuftrag } from '@/marathonApi.js';
import { useDebounced } from '@/hooks/useDebounced.js';
import {
  Page, Topbar, Card, Eyebrow, Lead, Button, Badge, T,
} from '@/components/ui.jsx';
import { LEVEL_META, getDisplayLevel } from '@/utils/auftragHelpers.js';

const PAGE_SIZE = 50;
const RECENT_MAX = 8;

const TYPE_FILTERS = [
  { id: 'all',            label: 'Alle' },
  { id: 'fnsku',          label: 'FNSKU' },
  { id: 'sku',            label: 'SKU' },
  { id: 'ean',            label: 'EAN' },
  { id: 'sendungsnummer', label: 'Sendungsnr.' },
  { id: 'file_name',      label: 'Datei' },
];

const DATE_PRESETS = [
  { id: 'all',   label: 'Alle' },
  { id: 'today', label: 'Heute' },
  { id: 'week',  label: 'Woche' },
  { id: 'month', label: 'Monat' },
];

const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevanz' },
  { id: 'newest',    label: 'Neueste' },
  { id: 'oldest',    label: 'Älteste' },
  { id: 'longest',   label: 'Längste Dauer' },
];

import type { Tone } from '@/components/ui';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  completed:   { label: 'Fertig',  tone: 'success' },
  in_progress: { label: 'Aktiv',   tone: 'warn'    },
  queued:      { label: 'Queue',   tone: 'neutral' },
  error:       { label: 'Fehler',  tone: 'danger'  },
};

const MATCH_LABEL = {
  fnsku: 'FNSKU', sku: 'SKU', ean: 'EAN',
  sendungsnummer: 'SN', file_name: 'FILE',
};

const RECENT_KEY = 'marathon.suche.recent';
const SAVED_KEY  = 'marathon.suche.saved';

/* ════════════════════════════════════════════════════════════════════════ */
export default function SucheScreen({ initialQuery = '' }) {
  const [query, setQuery]         = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [sort, setSort]           = useState('relevance');
  const [offset, setOffset]       = useState(0);
  const [openId, setOpenId]       = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const [recent, setRecent] = useState(() => readRecent());
  const [saved,  setSaved]  = useState(() => readSaved());

  const inputRef = useRef(null);

  /* CommandPalette → SucheScreen wiring: external query bumps mount. */
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      setOffset(0);
    }
  }, [initialQuery]);

  const debounced = useDebounced(query, 250);
  const trimmed = debounced.trim();
  const queryEnabled = trimmed.length >= 2;

  /* When date preset changes, derive concrete from/to. The manual picker
     overrides — once the user types into a date input, preset switches
     to 'all' so the picker remains source of truth. */
  useEffect(() => {
    const range = derivePresetRange(datePreset);
    if (range) {
      setFrom(range.from || '');
      setTo(range.to || '');
    }
  }, [datePreset]);

  /* Reset pagination & selection on filter change. */
  useEffect(() => { setOffset(0); setSelectedIdx(0); }, [trimmed, from, to, typeFilter, sort]);

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
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const allItems = searchQ.data?.items || [];
  const total = searchQ.data?.total || 0;

  /* Track recent searches — bump on stable query (debounced + ≥2 chars). */
  useEffect(() => {
    if (!queryEnabled) return;
    setRecent((prev) => {
      const next = bumpRecent(prev, trimmed);
      writeRecent(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  /* Apply client-side type filter + sort. */
  const items = useMemo(() => {
    let arr = allItems;
    if (typeFilter !== 'all') arr = arr.filter((it) => it.matchedField === typeFilter);
    return sortItems(arr, sort);
  }, [allItems, typeFilter, sort]);

  /* Insights — over the *typed-filter* result set. */
  const insights = useMemo(() => computeInsights(items), [items]);

  /* Clamp selectedIdx as items shrink. */
  useEffect(() => {
    if (selectedIdx >= items.length) setSelectedIdx(Math.max(0, items.length - 1));
  }, [items.length, selectedIdx]);

  const showLoadMore = queryEnabled && (offset + allItems.length < total);

  /* Saved-search bookmark actions. */
  const onSaveCurrent = () => {
    const label = window.prompt('Wie soll dieser gespeicherte Suchfilter heißen?', trimmed);
    if (!label) return;
    const entry = {
      id: cryptoId(),
      label: label.trim().slice(0, 60),
      emoji: pickEmoji(),
      query: trimmed,
      from: from || null,
      to: to || null,
      type: typeFilter,
      createdAt: Date.now(),
    };
    setSaved((prev) => {
      const next = [entry, ...prev].slice(0, 24);
      writeSaved(next);
      return next;
    });
  };
  const onApplySaved = (s) => {
    setQuery(s.query);
    setFrom(s.from || '');
    setTo(s.to || '');
    setTypeFilter(s.type || 'all');
    setDatePreset(s.from ? 'all' : 'all'); /* presets reset; manual values win */
    setOffset(0);
    inputRef.current?.focus();
  };
  const onDeleteSaved = (id) => {
    setSaved((prev) => {
      const next = prev.filter((x) => x.id !== id);
      writeSaved(next);
      return next;
    });
  };
  const onClearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  /* Keyboard cockpit. */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (e.key === '/' && !inField) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      if (e.key === 'Escape') {
        if (openId) { setOpenId(null); return; }
        if (document.activeElement === inputRef.current) {
          inputRef.current.blur();
          if (query) setQuery('');
          return;
        }
      }
      if (inField || openId) return;
      if (!items.length) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const t = items[selectedIdx];
        if (t) setOpenId(t.id);
      } else if (e.key === 'c') {
        e.preventDefault();
        const t = items[selectedIdx];
        const txt = t?.fbaCode || t?.fileName || '';
        if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedIdx, openId, query]);

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Suche' }]}
        right={
          queryEnabled && (
            <span style={{
              fontSize: 12.5,
              color: T.text.subtle,
              fontFamily: T.font.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}>
              {searchQ.isFetching ? 'lädt…' : `${total} Treffer`}
            </span>
          )
        }
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 40px 96px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Globale Suche · pg_trgm Fuzzy Index</Eyebrow>
          <h1 style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(36px, 2.8vw, 52px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: T.text.primary,
            margin: 0,
          }}>
            Aufträge finden
          </h1>
          <Lead style={{ marginTop: 16, maxWidth: 720, fontSize: 16 }}>
            Suche nach FNSKU, SKU, EAN, Sendungsnummer oder Dateiname über
            alle archivierten und aktiven Aufträge. Tippfehler sind erlaubt
            — der Index toleriert kleine Abweichungen.
          </Lead>
        </header>

        {/* HERO SEARCH INPUT */}
        <HeroInput
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          loading={searchQ.isFetching && queryEnabled}
        />

        {/* TOOLBAR — only when there's an active query */}
        {queryEnabled && (
          <Toolbar
            typeFilter={typeFilter}  onTypeFilter={setTypeFilter}
            datePreset={datePreset}  onDatePreset={setDatePreset}
            from={from}              onFrom={(v) => { setFrom(v); setDatePreset('all'); }}
            to={to}                  onTo={(v) => { setTo(v); setDatePreset('all'); }}
            sort={sort}              onSort={setSort}
            onSaveCurrent={onSaveCurrent}
          />
        )}

        {/* EMPTY STATE — revolution */}
        {!queryEnabled && (
          <EmptyHero
            recent={recent}
            saved={saved}
            onApplyQuery={(q) => { setQuery(q); inputRef.current?.focus(); }}
            onApplySaved={onApplySaved}
            onDeleteSaved={onDeleteSaved}
            onClearRecent={onClearRecent}
          />
        )}

        {/* ERROR */}
        {queryEnabled && searchQ.isError && (
          <Card padding={20} style={{
            background: T.status.danger.bg,
            borderColor: T.status.danger.border,
          }}>
            <span style={{ fontSize: 13, color: T.status.danger.text, fontWeight: 500 }}>
              Suchfehler: {searchQ.error?.message || 'Backend-Fehler'}
            </span>
          </Card>
        )}

        {/* NO RESULTS */}
        {queryEnabled && !searchQ.isError && items.length === 0 && !searchQ.isFetching && (
          <Card style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{
              fontSize: 22,
              fontWeight: 500,
              fontFamily: T.font.ui,
              letterSpacing: '-0.015em',
              color: T.text.primary,
              marginBottom: 8,
            }}>
              {typeFilter === 'all'
                ? `Keine Treffer für „${trimmed}"`
                : `Keine Treffer im Filter „${TYPE_FILTERS.find((t) => t.id === typeFilter)?.label}"`}
            </div>
            <div style={{
              fontSize: 14,
              color: T.text.subtle,
              maxWidth: 480,
              margin: '0 auto 20px',
              lineHeight: 1.55,
            }}>
              {typeFilter === 'all'
                ? 'Versuche eine andere Schreibweise, lass den Datumsbereich offen oder prüfe, ob der Auftrag im Archiv existiert.'
                : 'Wechsle den Typ-Filter auf „Alle", um alle Treffer zu sehen.'}
            </div>
            {typeFilter !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setTypeFilter('all')}>
                Filter zurücksetzen
              </Button>
            )}
          </Card>
        )}

        {/* INSIGHTS + RESULTS */}
        {queryEnabled && items.length > 0 && (
          <>
            <InsightsStrip insights={insights} total={items.length} totalUnfiltered={total} />

            <div style={{ display: 'grid', gap: 10 }}>
              {items.map((hit, i) => (
                <ResultCard
                  key={hit.id}
                  hit={hit}
                  query={trimmed}
                  isSelected={i === selectedIdx}
                  onSelect={() => setSelectedIdx(i)}
                  onOpen={() => setOpenId(hit.id)}
                />
              ))}
            </div>

            {showLoadMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <Button
                  variant="ghost"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={searchQ.isFetching}
                >
                  {searchQ.isFetching ? 'Lädt…' : `Weitere ${Math.min(PAGE_SIZE, total - (offset + allItems.length))} laden`}
                </Button>
              </div>
            )}

            <KbdHints />
          </>
        )}
      </main>

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════════ */
function readRecent() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function writeRecent(arr) {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch { /* quota */ }
}
function bumpRecent(prev, q) {
  const lower = q.toLowerCase();
  const filtered = prev.filter((r) => r.q.toLowerCase() !== lower);
  const existing = prev.find((r) => r.q.toLowerCase() === lower);
  const entry = {
    q,
    count: (existing?.count || 0) + 1,
    last: Date.now(),
  };
  return [entry, ...filtered].slice(0, RECENT_MAX);
}

function readSaved() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeSaved(arr) {
  try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); } catch { /* quota */ }
}

function cryptoId() {
  /* Tiny, collision-resistant enough for a localStorage list. */
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function pickEmoji() {
  const pool = ['🔥', '⭐', '📦', '🚚', '⚡', '🎯', '📌', '🔖', '💡', '🌟'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function derivePresetRange(preset) {
  if (preset === 'all') return { from: '', to: '' };
  const today = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (preset === 'today') return { from: fmt(today), to: fmt(today) };
  if (preset === 'week') {
    const d = new Date(today); d.setDate(d.getDate() - 7);
    return { from: fmt(d), to: fmt(today) };
  }
  if (preset === 'month') {
    const d = new Date(today); d.setMonth(d.getMonth() - 1);
    return { from: fmt(d), to: fmt(today) };
  }
  return null;
}

function sortItems(arr, sort) {
  const c = [...arr];
  if (sort === 'newest')   c.sort((a, b) => tsOf(b) - tsOf(a));
  if (sort === 'oldest')   c.sort((a, b) => tsOf(a) - tsOf(b));
  if (sort === 'longest')  c.sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
  /* 'relevance' — preserve server order (already ranked by pg_trgm score). */
  return c;
}
function tsOf(it) {
  return it.finishedAt
    ? new Date(it.finishedAt).getTime()
    : new Date(it.createdAt || 0).getTime();
}

function computeInsights(items) {
  const status = { completed: 0, in_progress: 0, queued: 0, error: 0 };
  const matchField = { fnsku: 0, sku: 0, ean: 0, sendungsnummer: 0, file_name: 0 };
  let oldest = null, newest = null;
  for (const it of items) {
    if (status[it.status] !== undefined) status[it.status] += 1;
    if (it.matchedField && matchField[it.matchedField] !== undefined) matchField[it.matchedField] += 1;
    const ts = tsOf(it);
    if (ts > 0) {
      if (oldest == null || ts < oldest) oldest = ts;
      if (newest == null || ts > newest) newest = ts;
    }
  }
  return { status, matchField, oldest, newest };
}

function fmtTimestamp(input) {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(input) {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtRelative(input) {
  if (!input) return '—';
  const t = typeof input === 'number' ? input : new Date(input).getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60)    return 'gerade eben';
  if (sec < 3600)  return `vor ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `vor ${Math.round(sec / 3600)} h`;
  const d = Math.round(sec / 86400);
  if (d < 7)       return `vor ${d} T`;
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
function fmtMmSs(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtDurationShort(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ════════════════════════════════════════════════════════════════════════
   Hero search input
   ════════════════════════════════════════════════════════════════════════ */
function HeroInput({ inputRef, value, onChange, loading }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 24px',
        height: 64,
        background: T.bg.surface,
        border: `1px solid ${focused ? T.accent.main : T.border.primary}`,
        borderRadius: 16,
        boxShadow: focused
          ? '0 1px 3px rgba(17,24,39,0.04), 0 8px 32px -10px rgba(99,102,241,0.18)'
          : '0 1px 2px rgba(17,24,39,0.03)',
        transition: 'all 200ms',
        marginBottom: 14,
      }}>
        <span style={{
          color: focused ? T.accent.main : T.text.subtle,
          display: 'inline-flex',
          flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="z. B. X0AB1234CD oder FBA15ABC123XYZ oder Lagerauftrag.docx"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            fontSize: 18,
            fontFamily: T.font.mono,
            fontWeight: 500,
            color: T.text.primary,
            background: 'transparent',
            letterSpacing: '-0.005em',
          }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            title="Eingabe löschen"
            style={{
              width: 26, height: 26,
              borderRadius: '50%',
              background: T.bg.surface3,
              border: 0,
              color: T.text.subtle,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {loading && <Spinner />}
        <span style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: T.text.faint,
          fontFamily: T.font.mono,
        }}>
          <Kbd>/</Kbd>
        </span>
      </div>
      <div style={{
        fontSize: 12,
        color: T.text.faint,
        fontFamily: T.font.mono,
        letterSpacing: '0.02em',
        marginBottom: 24,
      }}>
        Mind. 2 Zeichen · Tippfehler werden toleriert
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Toolbar
   ════════════════════════════════════════════════════════════════════════ */
function Toolbar({
  typeFilter, onTypeFilter,
  datePreset, onDatePreset,
  from, onFrom, to, onTo,
  sort, onSort,
  onSaveCurrent,
}) {
  return (
    <div style={{
      marginBottom: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Row 1 — type filter + sort + save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SegmentBar value={typeFilter} options={TYPE_FILTERS} onChange={onTypeFilter} />
        <span style={{ flex: 1 }} />
        <SortSelect value={sort} onChange={onSort} />
        <Button variant="ghost" size="sm" onClick={onSaveCurrent} title="Aktuelle Suche speichern">
          ⭐ Speichern
        </Button>
      </div>

      {/* Row 2 — date presets + manual range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11,
          fontFamily: T.font.mono,
          fontWeight: 600,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          marginRight: 4,
        }}>
          Datum
        </span>
        {DATE_PRESETS.map((p) => (
          <Chip key={p.id} active={datePreset === p.id} onClick={() => onDatePreset(p.id)}>
            {p.label}
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        <DateInput value={from} onChange={onFrom} />
        <span style={{ fontSize: 12, color: T.text.faint }}>—</span>
        <DateInput value={to} onChange={onTo} />
        {(from || to) && (
          <button
            onClick={() => { onFrom(''); onTo(''); }}
            title="Datumsbereich leeren"
            style={{
              border: 0,
              background: 'transparent',
              color: T.text.faint,
              cursor: 'pointer',
              fontSize: 16,
              padding: 2,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }) {
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
        fontSize: 12.5,
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

function SortSelect({ value, onChange }) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: T.text.subtle,
      fontFamily: T.font.mono,
      letterSpacing: '0.04em',
    }}>
      <span>Sort:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 28,
          padding: '0 26px 0 10px',
          fontSize: 12.5,
          fontFamily: T.font.ui,
          color: T.text.primary,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.full,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='%239CA3AF' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

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

function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 28,
        padding: '0 10px',
        fontSize: 12.5,
        fontFamily: T.font.ui,
        color: T.text.primary,
        background: T.bg.surface,
        border: `1px solid ${T.border.primary}`,
        borderRadius: T.radius.full,
        outline: 'none',
      }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Empty state — Recent · Saved · Tipp
   ════════════════════════════════════════════════════════════════════════ */
function EmptyHero({
  recent, saved,
  onApplyQuery, onApplySaved, onDeleteSaved, onClearRecent,
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: 16,
      marginTop: 8,
    }}>
      {/* Recent */}
      <Card padding={20}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11,
            fontFamily: T.font.mono,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
          }}>
            🕘 Letzte Suchanfragen
          </div>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={onClearRecent}
              style={{
                background: 'transparent',
                border: 0,
                fontSize: 11,
                fontFamily: T.font.mono,
                color: T.text.faint,
                cursor: 'pointer',
              }}
              title="Verlauf löschen"
            >
              leeren
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: T.text.faint, lineHeight: 1.55 }}>
            Hier landen deine letzten Suchanfragen — automatisch gespeichert,
            damit du sie mit einem Klick wiederholen kannst.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recent.map((r) => (
              <button
                key={r.q}
                onClick={() => onApplyQuery(r.q)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontFamily: T.font.mono,
                  background: T.bg.surface,
                  border: `1px solid ${T.border.primary}`,
                  borderRadius: T.radius.full,
                  color: T.text.primary,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent.border; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border.primary; }}
                title={`Zuletzt: ${fmtRelative(r.last)}`}
              >
                {r.q}
                <span style={{ color: T.text.faint, fontSize: 10.5 }}>· {r.count}×</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Saved */}
      <Card padding={20}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11,
            fontFamily: T.font.mono,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
          }}>
            ⭐ Gespeicherte Suchen
          </div>
          <span style={{
            fontSize: 11,
            color: T.text.faint,
            fontFamily: T.font.mono,
          }}>
            {saved.length}
          </span>
        </div>
        {saved.length === 0 ? (
          <div style={{ fontSize: 13, color: T.text.faint, lineHeight: 1.55 }}>
            Speichere häufige Anfragen mit Stern-Knopf in der Toolbar —
            Filter, Datum und Typ werden mitsichert.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {saved.slice(0, 8).map((s) => (
              <div
                key={s.id}
                onClick={() => onApplySaved(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: T.bg.surface,
                  border: `1px solid ${T.border.primary}`,
                  borderRadius: T.radius.md,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent.border; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border.primary; }}
              >
                <span style={{ fontSize: 16 }}>{s.emoji || '🔖'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: T.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.label}
                  </div>
                  <div style={{
                    fontSize: 11,
                    fontFamily: T.font.mono,
                    color: T.text.faint,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.query}
                    {s.from && <span> · {s.from}…{s.to || 'heute'}</span>}
                    {s.type && s.type !== 'all' && <span> · {(MATCH_LABEL[s.type] || s.type)}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteSaved(s.id); }}
                  title="Entfernen"
                  style={{
                    width: 22, height: 22,
                    background: 'transparent',
                    border: 0,
                    color: T.text.faint,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: T.radius.sm,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Insights strip
   ════════════════════════════════════════════════════════════════════════ */
function InsightsStrip({ insights, total, totalUnfiltered }: { insights: any; total: number; totalUnfiltered: number }) {
  const matchTotal = (Object.values(insights.matchField) as number[]).reduce((s, n) => s + n, 0) || 1;
  const matchEntries = (Object.entries(insights.matchField) as Array<[string, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      marginBottom: 16,
      padding: '18px 22px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
      gap: 24,
      alignItems: 'center',
    }}>
      {/* Status counters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, auto)',
        gap: 16,
        alignItems: 'baseline',
      }}>
        <KpiBox label="Treffer" value={total} accent={total !== totalUnfiltered ? `von ${totalUnfiltered}` : null} />
        <KpiBox label="Aktiv"   value={insights.status.in_progress} tone={insights.status.in_progress > 0 ? T.status.warn.text : null} />
        <KpiBox label="Fertig"  value={insights.status.completed}   tone={T.status.success.text} />
        <KpiBox label="Queue"   value={insights.status.queued} />
        <KpiBox label="Fehler"  value={insights.status.error}       tone={insights.status.error > 0 ? T.status.danger.text : null} />
      </div>

      {/* MatchField stacked bar + date span */}
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
          MatchField
        </div>
        <div style={{
          display: 'flex',
          width: '100%',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: T.bg.surface3,
          marginBottom: 8,
        }}>
          {matchEntries.map(([field, n], i) => (
            <span
              key={field}
              title={`${MATCH_LABEL[field]}: ${n}`}
              style={{
                flex: n,
                background: MATCH_COLORS[field] || T.text.faint,
                marginRight: i < matchEntries.length - 1 ? 1 : 0,
              }}
            />
          ))}
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 11,
          fontFamily: T.font.mono,
          color: T.text.subtle,
        }}>
          {matchEntries.map(([field, n]) => (
            <span key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 7, height: 7,
                borderRadius: '50%',
                background: MATCH_COLORS[field] || T.text.faint,
              }} />
              {MATCH_LABEL[field]} {n}
              <span style={{ color: T.text.faint }}>· {Math.round((n / matchTotal) * 100)}%</span>
            </span>
          ))}
        </div>
        {(insights.oldest || insights.newest) && (
          <div style={{
            marginTop: 10,
            fontSize: 11,
            fontFamily: T.font.mono,
            color: T.text.faint,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtDate(insights.oldest)}  →  {fmtDate(insights.newest)}
          </div>
        )}
      </div>
    </div>
  );
}

const MATCH_COLORS = {
  fnsku: 'var(--accent)',
  sku:   T.status.success.main,
  ean:   T.status.warn.main,
  sendungsnummer: '#3B82F6',
  file_name: T.text.faint,
};

function KpiBox({ label, value, tone, accent }: { label?: any; value?: any; tone?: string | null; accent?: any }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        color: tone || T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
      }}>
        {value}
        {accent && (
          <span style={{ fontSize: 11, color: T.text.faint, fontFamily: T.font.mono }}>
            {accent}
          </span>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Result card
   ════════════════════════════════════════════════════════════════════════ */
function ResultCard({ hit, query, isSelected, onSelect, onOpen }) {
  const statusCfg = STATUS_META[hit.status] || { label: hit.status, tone: 'neutral' };
  const tsLabel = hit.finishedAt ? fmtRelative(hit.finishedAt) : fmtRelative(hit.createdAt);
  const tsAbsolute = hit.finishedAt ? fmtTimestamp(hit.finishedAt) : fmtTimestamp(hit.createdAt);

  return (
    <div
      onClick={() => { onSelect(); onOpen(); }}
      onMouseEnter={onSelect}
      style={{
        padding: '18px 22px',
        background: T.bg.surface,
        border: `1px solid ${isSelected ? T.text.primary : T.border.primary}`,
        borderRadius: T.radius.lg,
        cursor: 'pointer',
        transition: 'border-color 120ms, background 120ms',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Match badge */}
      <MatchBadge field={hit.matchedField} />

      {/* Main */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 4,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 16,
            fontWeight: 500,
            color: T.text.primary,
            letterSpacing: '-0.005em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 360,
          }}>
            <Highlight text={hit.fbaCode || hit.fileName} query={query} />
          </span>
          {hit.assignedToUserName && (
            <Badge tone="neutral">{hit.assignedToUserName}</Badge>
          )}
          <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
        </div>

        {hit.matchedValue && hit.matchedField !== 'sendungsnummer' && hit.matchedField !== 'file_name' && (
          <div style={{
            fontSize: 12.5,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {MATCH_LABEL[hit.matchedField]}:{' '}
            <span style={{ color: T.accent.text, fontWeight: 600 }}>
              <Highlight text={hit.matchedValue} query={query} />
            </span>
          </div>
        )}

        <div style={{
          fontSize: 12,
          color: T.text.faint,
          marginBottom: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={hit.fileName}>
          {hit.fileName}
        </div>

        <div style={{
          display: 'flex',
          gap: 18,
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          flexWrap: 'wrap',
        }}>
          <Stat label="Paletten" value={hit.palletCount} />
          <Stat label="Artikel"  value={hit.articleCount} />
          {hit.durationSec ? (
            <Stat label="Dauer" value={fmtDurationShort(hit.durationSec)} accent />
          ) : null}
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }} title={tsAbsolute}>
            <span style={{ color: T.text.faint }}>{hit.finishedAt ? 'Beendet' : 'Erstellt'}</span>
            <span style={{ color: T.text.secondary, fontWeight: 500 }}>{tsLabel}</span>
          </span>
        </div>
      </div>

      {/* Open chevron */}
      <span style={{
        color: T.text.faint,
        flexShrink: 0,
        opacity: isSelected ? 1 : 0.5,
        transition: 'opacity 150ms',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

function Stat({ label, value, accent }: { label?: any; value?: any; accent?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: T.text.faint }}>{label}</span>
      <span style={{
        color: accent ? T.accent.text : T.text.secondary,
        fontWeight: 500,
        fontFamily: accent ? T.font.mono : 'inherit',
      }}>
        {value}
      </span>
    </span>
  );
}

function MatchBadge({ field }) {
  const label = MATCH_LABEL[field] || '·';
  const color = MATCH_COLORS[field] || T.text.faint;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 50,
      padding: '4px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.06em',
      color: '#fff',
      background: color,
      borderRadius: 4,
      fontFamily: T.font.mono,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function Highlight({ text, query }) {
  if (!text || !query) return text || '—';
  const t = String(text);
  const q = query.trim();
  if (!q) return t;
  /* Case-insensitive plain-text highlight; handles repeats. */
  const lower = t.toLowerCase();
  const ql = q.toLowerCase();
  const out = [];
  let cursor = 0;
  let idx = lower.indexOf(ql);
  while (idx !== -1) {
    if (idx > cursor) out.push(t.slice(cursor, idx));
    out.push(
      <mark
        key={`${idx}-${out.length}`}
        style={{
          background: T.accent.bg,
          color: T.accent.text,
          padding: '0 1px',
          borderRadius: 2,
          fontWeight: 600,
        }}
      >
        {t.slice(idx, idx + q.length)}
      </mark>
    );
    cursor = idx + q.length;
    idx = lower.indexOf(ql, cursor);
  }
  if (cursor < t.length) out.push(t.slice(cursor));
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   Detail modal — magazine spread + Gantt + articles
   ════════════════════════════════════════════════════════════════════════ */
function DetailModal({ id, onClose }) {
  const detailQ = useQuery({
    queryKey: ['auftrag', id],
    queryFn: () => getAuftrag(id),
    staleTime: 60_000,
  });

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const a = detailQ.data;
  const articles = useMemo(() => {
    const pallets = a?.parsed?.pallets || [];
    return pallets.flatMap((p) =>
      (p.items || []).map((it, i) => ({
        palletId: p.id,
        itemIdx: i,
        sku: it.sku,
        fnsku: it.fnsku,
        ean: it.ean,
        title: it.title,
        units: it.units,
        useItem: it.useItem,
        level: getDisplayLevel(it),
      })),
    );
  }, [a]);

  const palletGantt = useMemo(() => {
    const pallets = a?.parsed?.pallets || [];
    const lookup = new Map(pallets.map((p) => [p.id, p]));
    const rows = [];
    for (const [pid, t] of Object.entries(a?.palletTimings || {})) {
      if (!t.startedAt || !t.finishedAt) continue;
      const p = lookup.get(pid);
      const items = p?.items || [];
      const lvl = items.length ? primaryLevelOf(items) : 1;
      rows.push({
        id: pid,
        level: lvl,
        durSec: Math.round((t.finishedAt - t.startedAt) / 1000),
        startMs: t.startedAt,
      });
    }
    rows.sort((x, y) => x.startMs - y.startMs);
    return rows;
  }, [a]);

  const onCopyFba = () => {
    if (!a) return;
    const txt = a.fbaCode || a.fileName || '';
    if (txt && navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {/* no-op */});
    }
  };

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
          width: 'min(94vw, 920px)',
          maxHeight: 'calc(100vh - 120px)',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 16,
          boxShadow: T.shadow.modal,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: T.font.ui,
        }}
      >
        {/* Header — magazine spread */}
        <div style={{
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${T.border.primary}`,
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10.5,
            fontFamily: T.font.mono,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            marginBottom: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent.main }} />
            Auftrag-Detail
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: T.font.mono,
                fontSize: 24,
                fontWeight: 500,
                color: T.text.primary,
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {detailQ.isLoading ? 'lädt…' : (a?.fbaCode || a?.fileName || '—')}
              </div>
            </div>
            {a && (
              <Badge tone={STATUS_META[a.status]?.tone || 'neutral'}>
                {STATUS_META[a.status]?.label || a.status}
              </Badge>
            )}
            <button
              onClick={onClose}
              title="Schließen (Esc)"
              style={{
                width: 32, height: 32,
                border: 0,
                background: T.bg.surface3,
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
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 24px' }}>
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
                gap: 14,
                marginBottom: 24,
              }}>
                <MetaCell label="Datei" value={a.fileName} mono />
                <MetaCell label="Operator" value={a.assignedToUserName || '—'} />
                <MetaCell label="Paletten" value={a.palletCount} />
                <MetaCell label="Artikel" value={a.articleCount} />
                <MetaCell label="Erstellt" value={fmtTimestamp(a.createdAt)} mono />
                <MetaCell label="Gestartet" value={a.startedAt ? fmtTimestamp(a.startedAt) : '—'} mono />
                <MetaCell label="Beendet" value={a.finishedAt ? fmtTimestamp(a.finishedAt) : '—'} mono />
                <MetaCell label="Dauer" value={a.durationSec ? fmtDurationShort(a.durationSec) : '—'} mono accent />
              </div>

              {/* Gantt */}
              {palletGantt.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <SectionLabel
                    title="Palettenzeiten"
                    sub={`${palletGantt.length} von ${a.palletCount} mit Daten`}
                  />
                  <PalletGantt rows={palletGantt} />
                </div>
              )}

              {/* Articles */}
              <SectionLabel
                title="Artikel"
                sub={`${articles.length} insgesamt`}
              />
              <div style={{
                border: `1px solid ${T.border.primary}`,
                background: T.bg.surface,
                borderRadius: T.radius.md,
                overflow: 'hidden',
                maxHeight: 320,
                overflowY: 'auto',
              }}>
                <div style={articlesHeader}>
                  <span>Palette</span>
                  <span>Name</span>
                  <span>Code</span>
                  <span>Use-Item</span>
                  <span style={{ textAlign: 'right' }}>Menge</span>
                </div>
                {articles.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: T.text.faint }}>
                    Keine Artikel-Daten gespeichert.
                  </div>
                )}
                {articles.slice(0, 200).map((it, j) => {
                  const meta = LEVEL_META[it.level] || LEVEL_META[1];
                  return (
                    <div key={j} style={{
                      ...articlesRow,
                      borderBottom: j < articles.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: T.font.mono, fontSize: 11.5 }}>
                        <span style={{
                          width: 6, height: 6,
                          borderRadius: '50%',
                          background: meta.color,
                          flexShrink: 0,
                        }} />
                        <span style={{ color: T.text.faint }}>{it.palletId}</span>
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
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {a && (
          <div style={{
            padding: '14px 28px',
            borderTop: `1px solid ${T.border.primary}`,
            background: T.bg.surface2,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{
              fontSize: 11,
              fontFamily: T.font.mono,
              color: T.text.faint,
              letterSpacing: '0.04em',
            }}>
              Esc zum Schließen
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={onCopyFba}>
              📋 FBA kopieren
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCell({ label, value, mono, accent }: { label?: any; value?: any; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? T.font.mono : T.font.ui,
        fontSize: 13.5,
        fontWeight: 500,
        color: accent ? T.accent.text : T.text.primary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }} title={String(value)}>
        {value}
      </div>
    </div>
  );
}

function PalletGantt({ rows }) {
  const max = Math.max(...rows.map((r) => r.durSec), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => {
        const meta = LEVEL_META[r.level] || LEVEL_META[1];
        const widthPct = (r.durSec / max) * 100;
        return (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 80px',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11.5,
              fontWeight: 500,
              color: T.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }} title={r.id}>
              {r.id}
            </span>
            <div style={{
              position: 'relative',
              height: 18,
              background: T.bg.surface3,
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div
                title={`${meta.shortName} · ${fmtMmSs(r.durSec)}`}
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: meta.color,
                  borderRadius: 4,
                }}
              />
            </div>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11.5,
              fontWeight: 500,
              color: T.text.primary,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
            }}>
              {fmtMmSs(r.durSec)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function primaryLevelOf(items) {
  const counts = {};
  for (const it of items) {
    const lvl = getDisplayLevel(it);
    counts[lvl] = (counts[lvl] || 0) + (it.units || 0);
  }
  let best = 1, bestN = -1;
  for (const [lvl, n] of Object.entries(counts) as Array<[string, number]>) {
    if (n > bestN) { bestN = n; best = parseInt(lvl, 10); }
  }
  return best;
}

function SectionLabel({ title, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
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
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const articlesHeader: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '90px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
  padding: '8px 14px',
  background: T.bg.surface2,
  borderBottom: `1px solid ${T.border.primary}`,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: T.font.mono,
  color: T.text.subtle,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  position: 'sticky',
  top: 0,
};

const articlesRow = {
  display: 'grid',
  gridTemplateColumns: '90px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
  padding: '9px 14px',
  fontSize: 12.5,
  color: T.text.secondary,
  alignItems: 'center',
};

/* ════════════════════════════════════════════════════════════════════════
   Misc
   ════════════════════════════════════════════════════════════════════════ */
function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: `2px solid ${T.border.primary}`,
      borderTopColor: T.accent.main,
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'mp-spin 600ms linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function KbdHints() {
  const items = [
    { k: '/',     v: 'Suche fokussieren' },
    { k: 'j / k', v: 'Navigieren' },
    { k: '⏎',     v: 'Detail öffnen' },
    { k: 'c',     v: 'FBA kopieren' },
    { k: 'Esc',   v: 'Schließen / leeren' },
  ];
  return (
    <div style={{
      marginTop: 36,
      paddingTop: 20,
      borderTop: `1px solid ${T.border.subtle}`,
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
      fontSize: 11.5,
      color: T.text.faint,
      fontFamily: T.font.mono,
      letterSpacing: '0.04em',
    }}>
      {items.map((it) => (
        <span key={it.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Kbd>{it.k}</Kbd>
          <span>{it.v}</span>
        </span>
      ))}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 22, height: 18,
      padding: '0 6px',
      fontSize: 10.5,
      fontFamily: T.font.mono,
      color: T.text.secondary,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 3,
      lineHeight: 1,
    }}>
      {children}
    </span>
  );
}