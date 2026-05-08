// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
/* AuftragFinaleStage — final transition card when the last article of
   the last pallet has been completed.

   Same visual language as PalletInterlude: plain bordered card on a
   light dimmer, no glass / blur / aurora. Big checkmark, total stats,
   2s auto-advance to Abschluss. Press Space to advance immediately.

   Reduce-motion: collapses to a quick opacity fade. */

import { useEffect } from 'react';
import { Button, T } from './ui.jsx';

export default function AuftragFinaleStage({
  totals,
  reducedMotion = false,
  // eslint-disable-next-line no-unused-vars
  schnellmodus = false,
  onComplete,
}) {
  /* Hard gate: no auto-advance, no overlay-click dismiss. The worker
     must explicitly press Space/Enter or click the action button so
     they read the completion summary intentionally before the route
     change to Abschluss. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onComplete?.();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onComplete]);

  const m3   = ((totals?.volCm3 || 0) / 1e6).toFixed(2);
  const kg   = Math.round(totals?.weightKg || 0);
  const time = fmtLong(totals?.durationMs || 0);
  const fadeMs = reducedMotion ? 120 : 320;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'rgba(17, 24, 39, 0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        animation: `finale-bg-in ${fadeMs}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          padding: '36px 40px',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 20,
          boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 24px 56px -20px rgba(17,24,39,0.20)',
          fontFamily: T.font.ui,
          textAlign: 'center',
          cursor: 'default',
          animation: `finale-card-in ${fadeMs * 1.4}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        }}
      >
        {/* Checkmark */}
        <div
          className={reducedMotion ? '' : 'mr-finale-burst'}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: T.status.success.bg,
            border: `1px solid ${T.status.success.border}`,
            color: T.status.success.text,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Eyebrow */}
        <div style={{
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          marginBottom: 8,
        }}>
          Auftrag abgeschlossen
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(28px, 3.4vw, 38px)',
          fontWeight: 500,
          letterSpacing: '-0.025em',
          color: T.text.primary,
          margin: 0,
          lineHeight: 1.1,
        }}>
          Alles erledigt
        </h1>

        {/* Stats grid */}
        <div style={{
          marginTop: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 16,
          paddingTop: 20,
          borderTop: `1px solid ${T.border.subtle}`,
        }}>
          <Stat label="Paletten" value={totals?.palletCount ?? '—'} />
          <Stat label="Artikel" value={totals?.itemCount ?? '—'} />
          <Stat label="Gewicht" value={`${kg} kg`} />
          <Stat label="Volumen" value={`${m3} m³`} />
          <Stat label="Dauer" value={time} />
        </div>

        {/* Action — explicit dismiss only (Space/Enter or click). */}
        <div style={{
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}>
          <Button variant="primary" onClick={onComplete}
                  title="Zur Abschluss-Seite (Space)">
            Zu Abschluss
            <Kbd>Space</Kbd>
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes finale-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes finale-card-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        color: T.text.subtle,
        fontWeight: 600,
        fontFamily: T.font.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: '-0.018em',
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
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
      fontSize: 10.5, fontFamily: T.font.mono,
      color: T.text.secondary,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 3,
      lineHeight: 1,
    }}>{children}</span>
  );
}

function fmtLong(ms) {
  if (!ms || ms < 0) return '0:00';
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}