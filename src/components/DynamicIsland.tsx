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
import { useIslandState } from '@/hooks/useIslandState.js';
import { useConnectionStatus } from '@/hooks/useConnectionStatus.js';
import { T } from './ui.jsx';

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const DURATION_MS = 480;
const HOVER_EXPAND_DELAY = 220;
const AUTO_COLLAPSE_MS = 4000;
const PREDICTIVE_EXPAND_MS = 2500;

/* Severity palette adapted to Marathon's light surfaces — the icon
   chip is filled with the severity tint, body stays clean white so
   the island reads as a peer of the rest of the design system rather
   than as a foreign dark badge. */
const SEVERITY_PALETTE = {
  ok:    { fg: T.status.success.main, bg: T.status.success.bg, glow: 'rgba(16,185,129,0.30)' },
  info:  { fg: T.text.subtle,         bg: T.bg.surface3,        glow: 'rgba(99,102,241,0.18)' },
  warn:  { fg: T.status.warn.main,    bg: T.status.warn.bg,     glow: 'rgba(245,158,11,0.34)' },
  error: { fg: T.status.danger.main,  bg: T.status.danger.bg,   glow: 'rgba(239,68,68,0.36)' },
};

const CONN_PALETTE = {
  online:       { fg: T.status.success.main, label: 'Online' },
  reconnecting: { fg: T.status.warn.main,    label: 'Verbinde …' },
  offline:      { fg: T.status.danger.main,  label: 'Offline' },
};

export default function DynamicIsland() {
  const briefing = useIslandState();
  const conn = useConnectionStatus();
  const [mode, setMode] = useState('glance');             // 'glance' | 'compact' | 'expanded'
  const [pulseKey, setPulseKey] = useState(0);
  const [isHovering, setIsHovering] = useState(false);    // pin-open while cursor is inside
  const lastSignatureRef = useRef(briefing?.signature);
  const lastConnRef = useRef(conn.state);
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

  /* ─── Connection-state escalation: trigger pulse + brief expand ─ */
  useEffect(() => {
    if (conn.state === lastConnRef.current) return;
    const wasOnline = lastConnRef.current === 'online';
    const isOnlineNow = conn.state === 'online';
    lastConnRef.current = conn.state;
    // Only pulse on user-noticeable changes: online→offline or recover.
    if ((wasOnline && !isOnlineNow) || (!wasOnline && isOnlineNow)) {
      setPulseKey((k) => k + 1);
      setMode((m) => (m === 'expanded' ? m : 'compact'));
      clearTimeout(predictiveTimerRef.current);
      predictiveTimerRef.current = setTimeout(() => {
        setMode((m) => (m === 'compact' ? 'glance' : m));
      }, PREDICTIVE_EXPAND_MS);
    }
  }, [conn.state]);

  /* ─── Auto-collapse — pinned-while-hovering, sticky on alerts ──── */
  useEffect(() => {
    if (mode === 'glance') return;
    // Cursor is inside — hold the current mode indefinitely so the
    // operator can read the briefing at their own pace. The timer
    // restarts the moment the cursor leaves.
    if (isHovering) {
      clearTimeout(collapseTimerRef.current);
      return;
    }
    const sticky =
      briefing?.severity === 'warn' ||
      briefing?.severity === 'error' ||
      conn.state === 'offline';
    if (sticky && mode === 'compact') return;          // hold compact open during alerts
    clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setMode('glance');
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(collapseTimerRef.current);
  }, [mode, briefing?.severity, conn.state, isHovering]);

  /* ─── Hover/click handlers (with debounce) ──────────────────────── */
  const hoverTimerRef = useRef(null);
  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    setIsHovering(true);
    hoverTimerRef.current = setTimeout(() => {
      setMode((m) => (m === 'glance' ? 'compact' : m));
    }, HOVER_EXPAND_DELAY);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setIsHovering(false);
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
  const connPalette = CONN_PALETTE[conn.state] || CONN_PALETTE.online;

  /* ─── Sizing per mode — slightly wider in expanded to fit Focus
         briefing's two progress bars + next-item preview row. ──── */
  const SIZES = {
    glance:   { width: 156, height: 34,  radius: 18, padX: 12, padY: 7 },
    compact:  { width: 296, height: 64,  radius: 22, padX: 16, padY: 11 },
    expanded: { width: 380, height: 'auto', maxHeight: 460, radius: 22, padX: 18, padY: 16 },
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
          top: 12,                                                    // above the workflow topbar — sits in the empty centre slot
          left: 'calc(50% + (var(--sidebar-width, 224px) / 2))',
          transform: 'translateX(-50%)',
          width: size.width,
          height: size.height,
          maxHeight: size.maxHeight,
          background: 'rgba(255, 255, 255, 0.92)',
          color: T.text.primary,
          borderRadius: size.radius,
          border: `1px solid ${T.border.primary}`,
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
          boxShadow: `0 8px 28px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
          fontFamily: T.font.ui,
          padding: `${size.padY}px ${size.padX}px`,
          overflow: 'hidden',
          cursor: mode === 'glance' ? 'pointer' : 'default',
          zIndex: 60,                                                 // sits below modal overlays (z 100+)
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
          {mode === 'glance'   && <GlanceContent  briefing={briefing} palette={palette} live={isLive} conn={conn} connPalette={connPalette} />}
          {mode === 'compact'  && <CompactContent briefing={briefing} palette={palette} conn={conn} connPalette={connPalette} />}
          {mode === 'expanded' && <ExpandedContent briefing={briefing} palette={palette} conn={conn} connPalette={connPalette} />}
        </div>
      </div>
    </>
  );
}

/* ─── Modes ─────────────────────────────────────────────────────────── */
function GlanceContent({ briefing, palette, live, conn, connPalette }) {
  const showConn = conn.state !== 'online';
  return (
    <>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: '50%',
        background: palette.bg,
        color: palette.fg,
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {briefing.glance.icon}
      </span>
      <span style={{
        fontSize: 12.5,
        fontWeight: 500,
        color: T.text.primary,
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
      }}>
        {briefing.glance.primary}
      </span>
      {/* Connection-status dot (only when not perfectly online) takes
          priority over the live dot — it's a more important signal. */}
      {showConn ? (
        <ConnDot conn={conn} connPalette={connPalette} />
      ) : live ? (
        <span aria-hidden="true" style={{
          display: 'inline-block',
          width: 6, height: 6, borderRadius: '50%',
          background: T.accent.main,
          boxShadow: `0 0 7px ${palette.glow}`,
          flexShrink: 0,
        }} />
      ) : null}
    </>
  );
}

function CompactContent({ briefing, palette, conn, connPalette }) {
  const { compact, context, expanded } = briefing;
  const showNext = context === 'focus' && expanded?.nextItemTitle;
  return (
    <>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 10,
        background: palette.bg,
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
          color: T.text.primary,
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
            color: T.text.subtle,
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
        {/* Focus-only next-item preview, shown as a tertiary line.
            Truncates aggressively — the expanded mode shows the
            full title. */}
        {showNext && (
          <span style={{
            fontSize: 10.5,
            color: T.text.faint,
            marginTop: 1,
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ color: T.accent.text, fontWeight: 600 }}>↳</span>
            <span>{expanded.nextItemTitle}</span>
          </span>
        )}
      </div>
      {/* Right-edge connection dot if anything's not green */}
      {conn.state !== 'online' && (
        <ConnDot conn={conn} connPalette={connPalette} />
      )}
    </>
  );
}

function ExpandedContent({ briefing, palette, conn, connPalette }) {
  let body;
  if (!briefing.expanded) {
    body = <CompactContent briefing={briefing} palette={palette} conn={conn} connPalette={connPalette} />;
  } else {
    switch (briefing.expanded.kind) {
      case 'pruefen':   body = <ExpandedPruefen   data={briefing.expanded} />; break;
      case 'focus':     body = <ExpandedFocus     data={briefing.expanded} />; break;
      case 'abschluss': body = <ExpandedAbschluss data={briefing.expanded} />; break;
      default:          body = <CompactContent briefing={briefing} palette={palette} conn={conn} connPalette={connPalette} />;
    }
  }
  return (
    <>
      {body}
      {/* Footer connection row — always present in expanded so the
          operator can verify backend reachability at a glance. */}
      <ConnRow conn={conn} connPalette={connPalette} />
    </>
  );
}

function ExpandedPruefen({ data }) {
  return (
    <>
      <Header title={data.title} sub={data.fba} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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
      <Header
        title={`${data.pallet.id} · L${data.levelMeta.shortName || ''}`}
        sub={`Palette ${data.palletPosition} von ${data.palletTotal}`}
        accentColor={data.levelMeta.color}
      />
      {/* Two stacked progress bars: pallet-local (level color) +
          Auftrag-overall (Marathon accent). The operator sees both
          "what's left here" and "how far through the whole thing". */}
      <ProgressRow
        label={`Item ${data.itemPos} von ${data.palletItemCount}`}
        pct={data.palletProgress}
        accent={data.levelMeta.color}
      />
      <ProgressRow
        label="Auftrag insgesamt"
        pct={data.overallProgress}
        accent={`var(--accent, ${T.accent.main})`}
      />
      <div style={{
        fontSize: 11.5,
        color: T.text.subtle,
        letterSpacing: '-0.005em',
        background: T.bg.surface2,
        border: `1px solid ${T.border.primary}`,
        borderRadius: T.radius.md,
        padding: '8px 10px',
      }}>
        <Row label="Aktuell">{data.currentItemTitle || '—'}</Row>
        {data.nextItemTitle && (
          <Row label="Nächste">{data.nextItemTitle}</Row>
        )}
        <Row label="Auf Palette">{formatDur(data.elapsedSec)}</Row>
        <Row label="Code">
          {data.codeDone
            ? <span style={{ color: T.status.success.main, fontWeight: 600 }}>✓ kopiert</span>
            : <span style={{ color: T.status.warn.main, fontWeight: 600 }}>● offen</span>}
        </Row>
      </div>
    </>
  );
}

function ExpandedAbschluss({ data }) {
  return (
    <>
      <Header title="Auftrag abgeschlossen" sub={data.fba} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Stat label="Dauer"   value={formatDur(data.durationSec)} />
        <Stat label="Artikel" value={data.articles} />
        <Stat label="Items/min" value={data.itemsPerMin} />
      </div>
    </>
  );
}

/* ─── Atoms (Marathon light theme) ──────────────────────────────────── */
function Header({ title, sub, accentColor }: { title?: any; sub?: any; accentColor?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: 13.5,
        fontWeight: 600,
        color: T.text.primary,
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
            flexShrink: 0,
          }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </span>
      {sub && (
        <span style={{
          fontSize: 11,
          color: T.text.faint,
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
      background: T.bg.surface2,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 8,
    }}>
      <span style={{
        fontSize: 9.5,
        color: T.text.faint,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: T.text.primary,
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
        color: T.text.subtle,
        marginBottom: 4,
      }}>
        <span style={{ letterSpacing: '-0.005em' }}>{label}</span>
        <span style={{
          fontVariantNumeric: 'tabular-nums',
          color: accent || T.text.primary,
          fontWeight: 600,
        }}>
          {Math.round((pct || 0) * 100)}%
        </span>
      </div>
      <div style={{
        height: 5,
        background: T.bg.surface3,
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (pct || 0) * 100)}%`,
          background: accent || T.accent.main,
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
      padding: '3px 0',
    }}>
      <span style={{
        color: T.text.faint,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        color: T.text.primary,
        fontSize: 12,
        fontWeight: 500,
        textAlign: 'right',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 240,
      }}>
        {children}
      </span>
    </div>
  );
}

function SeverityChips({ errCount, warnCount }) {
  if (!errCount && !warnCount) {
    return (
      <span style={{
        fontSize: 11.5,
        color: T.status.success.text,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: T.status.success.main,
        }} />
        Alles in Ordnung
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {errCount > 0 && (
        <span style={chipStyle(T.status.danger.main, T.status.danger.bg)}>{errCount} Fehler</span>
      )}
      {warnCount > 0 && (
        <span style={chipStyle(T.status.warn.main, T.status.warn.bg)}>{warnCount} Warn</span>
      )}
    </div>
  );
}

function chipStyle(color, bg) {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    background: bg,
    color,
    borderRadius: 999,
    fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${color}22`,
  };
}

/* ─── Connection-status atoms ─────────────────────────────────────── */
function ConnDot({ conn, connPalette }) {
  const isLive = conn.state === 'reconnecting';
  return (
    <span
      title={`${connPalette.label}${conn.lastError ? ` · ${conn.lastError}` : ''}`}
      aria-label={connPalette.label}
      style={{
        display: 'inline-block',
        width: 7, height: 7, borderRadius: '50%',
        background: connPalette.fg,
        boxShadow: `0 0 0 2px ${connPalette.fg}33`,
        flexShrink: 0,
        animation: isLive ? 'mr-island-blink 1.4s ease-in-out infinite' : undefined,
      }}
    />
  );
}

function ConnRow({ conn, connPalette }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      paddingTop: 8,
      borderTop: `1px solid ${T.border.subtle}`,
      marginTop: 2,
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10.5,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
      }}>
        <ConnDot conn={conn} connPalette={connPalette} />
        <span style={{ color: connPalette.fg, fontWeight: 700 }}>{connPalette.label}</span>
      </span>
      {conn.lastError && conn.state !== 'online' && (
        <span style={{
          fontSize: 10,
          color: T.text.faint,
          fontFamily: T.font.mono,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
        }}>
          {conn.lastError}
        </span>
      )}
    </div>
  );
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
      @keyframes mr-island-blink {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.35; }
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