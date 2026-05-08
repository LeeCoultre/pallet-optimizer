// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
/* PalletInterlude — proper pallet-completion checkpoint.

   This is NOT an auto-advance ceremony. It's a hard gate that forces
   the worker to mentally and physically separate the just-finished
   pallet from the next one. Without this, items intended for pallet
   B might end up on pallet A because the worker hadn't yet wrapped
   up A's physical handling (label, secure, clear the floor).

   Three sections:
     1. ✓ ABGESCHLOSSEN  — stats of the just-finished pallet
     2. CHECKLIST        — physical-task reminders
     3. NÄCHSTE PALETTE  — preview (ID + item count + level fingerprint)

   Dismissal: explicit click on the action button OR Space / Enter.
   Click on the dimmer overlay does NOT dismiss. Reduce-motion shrinks
   the entry animation but never removes the gate. */

import { useEffect } from 'react';
import { Button, T } from './ui.jsx';
import { LEVEL_META, getDisplayLevel } from '../utils/auftragHelpers.js';

export default function PalletInterlude({
  pallet,            // { id, itemCount, weightKg, volCm3, durationMs }
  nextPallet,        // { id, items, ... } — full pallet object so we can render fingerprint
  reducedMotion = false,
  onComplete,
}) {
  /* Space / Enter advance to next pallet. No keyboard shortcut for
     "click overlay to skip" — gate is explicit. */
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

  const m3 = ((pallet?.volCm3 || 0) / 1e6).toFixed(2);
  const kg = Math.round(pallet?.weightKg || 0);
  const time = fmt(pallet?.durationMs || 0);
  const fadeMs = reducedMotion ? 100 : 280;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        background: 'rgba(17, 24, 39, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        animation: `interlude-bg-in ${fadeMs}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 18,
          boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 24px 56px -20px rgba(17,24,39,0.24)',
          fontFamily: T.font.ui,
          overflow: 'hidden',
          animation: `interlude-card-in ${fadeMs * 1.4}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        }}
      >
        {/* ── 1. DONE section ── */}
        <div style={{ padding: '24px 28px 20px' }}>
          <SectionEyebrow color={T.status.success.text} icon={<CheckIcon />}>
            Palette abgeschlossen
          </SectionEyebrow>
          <div style={{
            marginTop: 8,
            fontFamily: T.font.mono,
            fontSize: 'clamp(28px, 3.6vw, 40px)',
            fontWeight: 500,
            letterSpacing: '-0.025em',
            color: T.text.primary,
            lineHeight: 1.05,
          }}>
            {pallet?.id || '—'}
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 12.5,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            fontVariantNumeric: 'tabular-nums',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}>
            <span>{pallet?.itemCount ?? '—'} Art</span>
            <Dot />
            <span>{kg} kg</span>
            <Dot />
            <span>{m3} m³</span>
            <Dot />
            <span>{time}</span>
          </div>
        </div>

        {/* ── 2. CHECKLIST section ── */}
        <div style={{
          padding: '18px 28px',
          borderTop: `1px solid ${T.border.subtle}`,
          background: T.bg.surface2,
        }}>
          <SectionEyebrow>Vor dem nächsten Schritt</SectionEyebrow>
          <ul style={{
            margin: '10px 0 0 0',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <ChecklistItem>Palette gesichert und abgelegt</ChecklistItem>
            <ChecklistItem>Etikett angebracht</ChecklistItem>
            <ChecklistItem>Arbeitsbereich frei für nächste Palette</ChecklistItem>
          </ul>
        </div>

        {/* ── 3. NEXT section ── */}
        {nextPallet && (
          <div style={{
            padding: '18px 28px 20px',
            borderTop: `1px solid ${T.border.subtle}`,
          }}>
            <SectionEyebrow color={T.accent.text}>Nächste Palette</SectionEyebrow>
            <NextPalletPreview pallet={nextPallet} />
          </div>
        )}

        {/* ── Action ── */}
        <div style={{
          padding: '16px 28px',
          borderTop: `1px solid ${T.border.subtle}`,
          background: T.bg.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            flex: 1,
            fontSize: 11.5,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            letterSpacing: '0.04em',
          }}>
            Bereit?
          </span>
          <Button variant="primary" onClick={onComplete}
                  title="Nächste Palette starten (Space)">
            {nextPallet ? `${nextPallet.id} starten` : 'Weiter'}
            <Kbd onPrimary>Space</Kbd>
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes interlude-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes interlude-card-in {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ── Section eyebrow (small mono caps with optional icon) ── */
function SectionEyebrow({ children, color, icon }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10.5,
      fontWeight: 600,
      fontFamily: T.font.mono,
      color: color || T.text.subtle,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
    }}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

/* ── Checklist item (◇ bullet, diamond hint without forcing tick state) ── */
function ChecklistItem({ children }) {
  return (
    <li style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: T.text.secondary,
      lineHeight: 1.4,
    }}>
      <span style={{
        flexShrink: 0,
        width: 14, height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${T.border.strong}`,
        borderRadius: 3,
        background: T.bg.surface,
      }} />
      <span>{children}</span>
    </li>
  );
}

/* ── Next-pallet preview: ID + item count + level fingerprint stripe ── */
function NextPalletPreview({ pallet }) {
  const items = pallet?.items || [];
  const total = items.length;
  return (
    <div style={{
      marginTop: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        fontFamily: T.font.mono,
      }}>
        <span style={{
          fontSize: 'clamp(22px, 2.6vw, 28px)',
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.018em',
          lineHeight: 1,
        }}>
          {pallet?.id}
        </span>
        <span style={{
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {total} Artikel
        </span>
      </div>

      {/* Level fingerprint mini-stripe — same vocabulary as the StickyBar */}
      <div style={{
        display: 'flex',
        gap: 1.5,
        height: 6,
      }}>
        {items.map((it, j) => {
          const lvl = it.level || getDisplayLevel(it) || 1;
          const meta = LEVEL_META[lvl] || LEVEL_META[1];
          return (
            <span key={j} style={{
              flex: '1 1 0',
              minWidth: 4,
              height: '100%',
              background: meta.color,
              opacity: 0.55,
              borderRadius: 1.5,
            }} />
          );
        })}
      </div>
    </div>
  );
}

/* ── Atoms ── */
function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(15,23,42,0.20)' }} />;
}

function Kbd({ children, onPrimary }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 22, height: 18,
      padding: '0 6px',
      fontSize: 10.5, fontFamily: T.font.mono, fontWeight: 600,
      color: onPrimary ? '#fff' : T.text.secondary,
      background: onPrimary ? 'rgba(255,255,255,0.18)' : T.bg.surface3,
      border: `1px solid ${onPrimary ? 'rgba(255,255,255,0.30)' : T.border.primary}`,
      borderRadius: 3,
      lineHeight: 1,
      letterSpacing: '0.04em',
    }}>{children}</span>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function fmt(ms) {
  if (!ms || ms < 0) return '0:00';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Legacy exports kept as no-ops — Focus.jsx imports `resetSkipCount`
   from this module. The auto-advance heuristic is gone, but the import
   stays for backwards compatibility. */
export function bumpSkipCount() { /* deprecated */ }
export function resetSkipCount() { /* deprecated */ }