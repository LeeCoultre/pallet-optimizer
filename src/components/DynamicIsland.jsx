/* ─────────────────────────────────────────────────────────────────────────
   DynamicIsland — fixed top-center morphing pill that always shows the
   single most-relevant fact for the current Marathon step. Inspired by
   Apple's Dynamic Island: tiny at rest, expands on hover/click, morphs
   smoothly between sizes via a spring-easing transition that animates
   width/height/border-radius together.

   Three modes:
     'glance'   — 22×~140 pill, icon + 1 short string
     'compact'  — 36×~240 pill, icon + title + secondary line
     'expanded' — 220×~360 panel, full briefing (progress bar, KPIs,
                  next-item preview, etc.)

   Auto-collapse — 4s after the last interaction. Sticky-on-warning:
   if briefing.severity ≥ 'warn', the auto-collapse timer is suspended
   so escalations stay visible.

   Predictive expand — `signature` field on the briefing changes when
   meaningful state shifts (severity escalation, copy success, pallet
   boundary). Each new signature triggers:
     • a one-shot pulse ring (1.6s)
     • a brief auto-expand to 'compact' for 2.5s

   Reduced-motion — respects `(prefers-reduced-motion: reduce)`,
   collapsing all spring animations to a single cross-fade.

   Mounted ONCE at the App.jsx root — does not require any prop wiring,
   reads everything from useIslandState() / useAppState() internally.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import { useIslandState } from '../hooks/useIslandState.js';
import { T } from './ui.jsx';

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const DURATION_MS = 480;
const HOVER_EXPAND_DELAY = 220;
const AUTO_COLLAPSE_MS = 4000;
const PREDICTIVE_EXPAND_MS = 2500;

const SEVERITY_PALETTE = {
  ok:    { fg: '#10B981', glow: 'rgba(16,185,129,0.35)' },
  info:  { fg: '#FFFFFF', glow: 'rgba(255,255,255,0.20)' },
  warn:  { fg: '#F59E0B', glow: 'rgba(245,158,11,0.40)' },
  error: { fg: '#EF4444', glow: 'rgba(239,68,68,0.45)' },
};

export default function DynamicIsland() {
  const briefing = useIslandState();
  const [mode, setMode] = useState('glance');             // 'glance' | 'compact' | 'expanded'
  const [pulseKey, setPulseKey] = useState(0);
  const lastSignatureRef = useRef(briefing?.signature);
  const collapseTimerRef = useRef(null);
  const predictiveTimerRef = useRef(null);
  const reducedMotion = useReducedMotion();

  /* ─── Predictive expand: signature changes → pulse + brief expand ── */
  useEffect(() => {
    if (!briefing) return;
    const sig = briefing.signature;
    if (sig === lastSignatureRef.current) return;
    lastSignatureRef.current = sig;
    // Skip the very first render (no previous state to compare against).
    setPulseKey((k) => k + 1);
    setMode((m) => (m === 'expanded' ? m : 'compact'));
    clearTimeout(predictiveTimerRef.current);
    predictiveTimerRef.current = setTimeout(() => {
      setMode((m) => (m === 'compact' ? 'glance' : m));
    }, PREDICTIVE_EXPAND_MS);
    return () => clearTimeout(predictiveTimerRef.current);
  }, [briefing?.signature]);

  /* ─── Auto-collapse — sticky-on-warning ─────────────────────────── */
  useEffect(() => {
    if (mode === 'glance') return;
    const sticky = briefing?.severity === 'warn' || briefing?.severity === 'error';
    if (sticky && mode === 'compact') return;          // hold compact open during alerts
    clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setMode('glance');
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(collapseTimerRef.current);
  }, [mode, briefing?.severity]);

  /* ─── Hover/click handlers (with debounce) ──────────────────────── */
  const hoverTimerRef = useRef(null);
  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setMode((m) => (m === 'glance' ? 'compact' : m));
    }, HOVER_EXPAND_DELAY);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
  };
  const handleClick = () => {
    setMode((m) => {
      if (m === 'glance')  return 'compact';
      if (m === 'compact') return 'expanded';
      return 'glance';
    });
  };
  // Click-outside collapses fully.
  const islandRef = useRef(null);
  useEffect(() => {
    if (mode !== 'expanded') return;
    const handler = (e) => {
      if (islandRef.current && !islandRef.current.contains(e.target)) {
        setMode('glance');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mode]);

  /* ─── ESC key collapses ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMode('glance');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!briefing) return null;
  const palette = SEVERITY_PALETTE[briefing.severity] || SEVERITY_PALETTE.info;
  const isLive = briefing.context === 'focus' || briefing.context === 'upload';

  /* ─── Sizing per mode ───────────────────────────────────────────── */
  const SIZES = {
    glance:   { width: 144, height: 30,  radius: 16, padX: 12, padY: 6 },
    compact:  { width: 264, height: 56,  radius: 20, padX: 16, padY: 10 },
    expanded: { width: 360, height: 'auto', maxHeight: 420, radius: 22, padX: 18, padY: 14 },
  };
  const size = SIZES[mode];

  return (
    <>
      <IslandKeyframes />
      <div
        ref={islandRef}
        role="status"
        aria-live="polite"
        aria-label={briefing.compact?.title || briefing.glance?.primary}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
          position: 'fixed',
          top: 14,
          left: 'calc(50% + (var(--sidebar-width, 224px) / 2))',
          transform: 'translateX(-50%)',
          width: size.width,
          height: size.height,
          maxHeight: size.maxHeight,
          background: 'rgba(13, 17, 23, 0.86)',
          color: '#fff',
          borderRadius: size.radius,
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: `0 8px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.04)`,
          fontFamily: T.font.ui,
          padding: `${size.padY}px ${size.padX}px`,
          overflow: 'hidden',
          cursor: mode === 'glance' ? 'pointer' : 'default',
          zIndex: 1000,
          transition: reducedMotion
            ? 'opacity 200ms linear'
            : `width ${DURATION_MS}ms ${SPRING}, height ${DURATION_MS}ms ${SPRING}, border-radius ${DURATION_MS}ms ${SPRING}`,
          // Subtle "alive" breathing in glance/compact when an active stream is running.
          animation: !reducedMotion && isLive && mode !== 'expanded'
            ? 'mr-island-breathe 3.6s ease-in-out infinite' : undefined,
          willChange: 'width, height, border-radius',
        }}
      >
        {/* Pulse ring on signature change */}
        {!reducedMotion && pulseKey > 0 && (
          <span
            key={pulseKey}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: size.radius + 4,
              border: `1.5px solid ${palette.fg}`,
              boxShadow: `0 0 18px 2px ${palette.glow}`,
              animation: 'mr-island-pulse 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Mode-specific content (cross-fade) */}
        <div
          key={mode}
          style={{
            display: 'flex',
            flexDirection: mode === 'expanded' ? 'column' : 'row',
            alignItems: mode === 'expanded' ? 'stretch' : 'center',
            gap: mode === 'expanded' ? 12 : 10,
            height: '100%',
            opacity: 0,
            animation: reducedMotion
              ? 'mr-island-fade 200ms ease-out forwards'
              : 'mr-island-fade 320ms 90ms ease-out forwards',
          }}
        >
          {mode === 'glance'   && <GlanceContent  briefing={briefing} palette={palette} live={isLive} />}
          {mode === 'compact'  && <CompactContent briefing={briefing} palette={palette} live={isLive} />}
          {mode === 'expanded' && <ExpandedContent briefing={briefing} palette={palette} />}
        </div>
      </div>
    </>
  );
}

/* ─── Modes ─────────────────────────────────────────────────────────── */
function GlanceContent({ briefing, palette, live }) {
  return (
    <>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: live ? palette.fg : 'transparent',
        color: live ? '#000' : palette.fg,
        fontSize: 11,
        fontWeight: 700,
      }}>
        {briefing.glance.icon}
      </span>
      <span style={{
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
      }}>
        {briefing.glance.primary}
      </span>
      {/* Live dot — subtle rhythmic breath */}
      {live && (
        <span aria-hidden="true" style={{
          display: 'inline-block',
          width: 6, height: 6, borderRadius: '50%',
          background: palette.fg,
          boxShadow: `0 0 8px ${palette.glow}`,
        }} />
      )}
    </>
  );
}

function CompactContent({ briefing, palette }) {
  const { compact } = briefing;
  return (
    <>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 10,
        background: `${palette.fg}22`,
        color: palette.fg,
        fontSize: 16,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {compact.icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {compact.title}
        </span>
        {compact.sub && (
          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.62)',
            marginTop: 2,
            letterSpacing: '-0.005em',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {compact.sub}
          </span>
        )}
      </div>
    </>
  );
}

function ExpandedContent({ briefing, palette }) {
  if (!briefing.expanded) return <CompactContent briefing={briefing} palette={palette} />;
  switch (briefing.expanded.kind) {
    case 'pruefen':   return <ExpandedPruefen   data={briefing.expanded} />;
    case 'focus':     return <ExpandedFocus     data={briefing.expanded} />;
    case 'abschluss': return <ExpandedAbschluss data={briefing.expanded} />;
    default:          return <CompactContent briefing={briefing} palette={palette} />;
  }
}

function ExpandedPruefen({ data }) {
  return (
    <>
      <Header title={data.title} sub={data.fba} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {data.stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
      <SeverityChips errCount={data.errCount} warnCount={data.warnCount} />
    </>
  );
}

function ExpandedFocus({ data }) {
  return (
    <>
      <Header title={`${data.pallet.id} · L${data.levelMeta.shortName ? data.levelMeta.shortName : ''}`}
              sub={`Palette ${data.palletPosition} von ${data.palletTotal}`}
              accentColor={data.levelMeta.color} />
      <ProgressRow
        label={`Item ${data.itemPos} von ${data.palletItemCount}`}
        pct={data.palletProgress}
        accent={data.levelMeta.color}
      />
      <div style={{
        fontSize: 11.5,
        color: 'rgba(255,255,255,0.78)',
        letterSpacing: '-0.005em',
      }}>
        <Row label="Aktuell">{data.currentItemTitle || '—'}</Row>
        {data.nextItemTitle && (
          <Row label="Nächste">{data.nextItemTitle}</Row>
        )}
        <Row label="Auf Palette">{formatDur(data.elapsedSec)}</Row>
        <Row label="Code">{data.codeDone ? <span style={{ color: '#10B981' }}>✓ kopiert</span> : <span style={{ color: '#F59E0B' }}>● offen</span>}</Row>
      </div>
    </>
  );
}

function ExpandedAbschluss({ data }) {
  return (
    <>
      <Header title="Auftrag abgeschlossen" sub={data.fba} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Stat label="Dauer"   value={formatDur(data.durationSec)} />
        <Stat label="Artikel" value={data.articles} />
        <Stat label="Items/min" value={data.itemsPerMin} />
      </div>
    </>
  );
}

/* ─── Atoms ─────────────────────────────────────────────────────────── */
function Header({ title, sub, accentColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        letterSpacing: '-0.01em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {accentColor && (
          <span aria-hidden="true" style={{
            width: 8, height: 8,
            borderRadius: 2,
            background: accentColor,
          }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </span>
      {sub && (
        <span style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          fontFamily: T.font.mono,
          letterSpacing: '0.01em',
        }}>
          {sub}
        </span>
      )}
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 8,
    }}>
      <span style={{
        fontSize: 9.5,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.015em',
      }}>
        {value}
      </span>
    </div>
  );
}
function ProgressRow({ label, pct, accent }) {
  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 4,
      }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: accent || '#fff' }}>
          {Math.round((pct || 0) * 100)}%
        </span>
      </div>
      <div style={{
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (pct || 0) * 100)}%`,
          background: accent || '#fff',
          borderRadius: 999,
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
      padding: '4px 0',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{
        color: '#fff',
        fontSize: 12,
        fontWeight: 500,
        textAlign: 'right',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 220,
      }}>
        {children}
      </span>
    </div>
  );
}
function SeverityChips({ errCount, warnCount }) {
  if (!errCount && !warnCount) {
    return <span style={{ fontSize: 11.5, color: '#10B981' }}>✓ Alles in Ordnung</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {errCount > 0 && (
        <span style={chipStyle('#EF4444')}>{errCount} Fehler</span>
      )}
      {warnCount > 0 && (
        <span style={chipStyle('#F59E0B')}>{warnCount} Warn</span>
      )}
    </div>
  );
}
function chipStyle(color) {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    background: `${color}22`,
    color,
    borderRadius: 999,
    fontVariantNumeric: 'tabular-nums',
  };
}
function formatDur(sec) {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* ─── Animation keyframes (mounted once via portal-style style tag) ── */
function IslandKeyframes() {
  return (
    <style>{`
      @keyframes mr-island-fade {
        from { opacity: 0; transform: translateY(-3px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes mr-island-pulse {
        0%   { opacity: 0.85; transform: scale(1); }
        70%  { opacity: 0;    transform: scale(1.06); }
        100% { opacity: 0;    transform: scale(1.06); }
      }
      @keyframes mr-island-breathe {
        0%, 100% { transform: translateX(-50%) scale(1); }
        50%      { transform: translateX(-50%) scale(1.012); }
      }
    `}</style>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
