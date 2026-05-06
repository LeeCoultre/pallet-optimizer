/* ─────────────────────────────────────────────────────────────────────────
   PreflightCard — surfaces a `PreflightBriefing` from preflightAnalyzer
   above the Pruefen pallet list. Replaces the previous two banners
   (parsing-validation + OVERLOAD-distribution) with one unified card so
   the operator gets a single source-of-truth for "is this Auftrag ready?".

   Behaviour:
     • Collapsed by default if briefing.worst === 'ok' (everything green).
     • Auto-expanded on first render if any error/warn flag exists.
     • Header is a button — click toggles the body.
     • Each flag has an optional "open Pallet PX-BY" or "Admin · Dimensions"
       action; the parent decides what those do via callbacks.
   ───────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { T } from './ui.jsx';

const KIND_LABELS = {
  parsing:      'Parsing',
  capacity:     'Auslastung',
  distribution: 'Verteilung',
  coverage:     'Abdeckung',
  structural:   'Struktur',
};

const SEVERITY_PALETTE = {
  error: T.status.danger,
  warn:  T.status.warn,
  info:  { main: T.text.subtle, bg: T.bg.surface3, text: T.text.secondary, border: T.border.primary },
};

export default function PreflightCard({ briefing, onJumpToPallet, onAction }) {
  // Collapsed by default — header tone (red/amber/green) already conveys
  // status at a glance; user clicks to drill into specific flags.
  const [open, setOpen] = useState(false);

  if (!briefing) return null;

  const errors = briefing.flags.filter((f) => f.severity === 'error');
  const warns  = briefing.flags.filter((f) => f.severity === 'warn');
  const infos  = briefing.flags.filter((f) => f.severity === 'info');

  const tone = briefing.worst === 'error' ? 'danger'
             : briefing.worst === 'warn'  ? 'warn'
             : 'success';
  const palette = T.status[tone] || T.status.success;

  const titleParts = [];
  if (errors.length) titleParts.push(`${errors.length} Fehler`);
  if (warns.length)  titleParts.push(`${warns.length} Warnung${warns.length === 1 ? '' : 'en'}`);
  if (infos.length)  titleParts.push(`${infos.length} Hinweis${infos.length === 1 ? '' : 'e'}`);
  const headerTitle = briefing.worst === 'ok'
    ? 'Auftrag bereit zur Bearbeitung'
    : titleParts.join(' · ');

  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: T.radius.lg,
      overflow: 'hidden',
      transition: 'border-color 200ms',
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 20px',
          width: '100%',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: T.font.ui,
          color: 'inherit',
        }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: '50%',
          background: palette.main,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {briefing.worst === 'ok' ? <CheckIcon /> : <WarnIcon />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>
            {headerTitle}
          </div>
          <div style={{
            fontSize: 12.5,
            color: palette.text,
            opacity: 0.85,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatTotals(briefing.totals)}
          </div>
        </div>
        {briefing.flags.length > 0 && (
          <span style={{
            color: palette.text,
            opacity: 0.7,
            transition: 'transform 200ms',
            transform: open ? 'rotate(180deg)' : 'none',
            display: 'inline-flex',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>

      {/* Body */}
      {open && briefing.flags.length > 0 && (
        <div style={{
          background: T.bg.surface,
          borderTop: `1px solid ${palette.border}`,
          padding: '16px 20px',
        }}>
          {errors.length > 0 && (
            <FlagSection title="Fehler" flags={errors} onJumpToPallet={onJumpToPallet} onAction={onAction} />
          )}
          {warns.length > 0 && (
            <FlagSection title="Warnungen" flags={warns} onJumpToPallet={onJumpToPallet} onAction={onAction} mt={errors.length ? 16 : 0} />
          )}
          {infos.length > 0 && (
            <FlagSection title="Hinweise" flags={infos} onJumpToPallet={onJumpToPallet} onAction={onAction} mt={(errors.length || warns.length) ? 16 : 0} dim />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Section / row ───────────────────────────────────────────────────── */
function FlagSection({ title, flags, onJumpToPallet, onAction, mt, dim }) {
  return (
    <div style={{ marginTop: mt || 0 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: dim ? T.text.subtle : T.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
      }}>
        {title}
      </div>
      <ul style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {flags.map((f, i) => (
          <FlagRow
            key={`${f.code}-${f.target?.palletId || ''}-${i}`}
            flag={f}
            onJumpToPallet={onJumpToPallet}
            onAction={onAction}
          />
        ))}
      </ul>
    </div>
  );
}

function FlagRow({ flag, onJumpToPallet, onAction }) {
  const palette = SEVERITY_PALETTE[flag.severity] || SEVERITY_PALETTE.info;
  return (
    <li style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      {/* Severity dot */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: palette.main,
        marginTop: 7,
      }} />

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          color: T.text.primary,
          lineHeight: 1.5,
          letterSpacing: '-0.005em',
        }}>
          {flag.message}
        </div>
        <div style={{
          marginTop: 6,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 10.5,
            color: T.text.faint,
            letterSpacing: '0.02em',
          }}>
            {KIND_LABELS[flag.kind] || flag.kind} · {flag.code}
          </span>
          {flag.target?.palletId && onJumpToPallet && (
            <ActionChip
              label={`${flag.target.palletId} öffnen →`}
              onClick={() => onJumpToPallet(flag.target.palletId)}
            />
          )}
          {flag.actionLabel && flag.actionHref && (
            <ActionChip
              label={`${flag.actionLabel} →`}
              onClick={() => onAction?.(flag)}
              href={flag.actionHref}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function ActionChip({ label, onClick, href }) {
  const handleClick = (e) => {
    if (href && !onClick) return; // let the anchor handle it
    e.preventDefault();
    onClick?.();
  };
  const style = {
    fontSize: 11.5,
    fontWeight: 600,
    color: T.accent.text,
    background: T.accent.bg,
    border: `1px solid ${T.accent.border}`,
    padding: '3px 9px',
    borderRadius: T.radius.sm,
    cursor: 'pointer',
    fontFamily: T.font.ui,
    textDecoration: 'none',
    lineHeight: 1.4,
  };
  if (href) {
    return (
      <a href={href} onClick={handleClick} style={style}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={handleClick} style={style}>
      {label}
    </button>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function formatTotals(t) {
  if (!t) return '';
  const parts = [
    `${t.palletCount} Paletten`,
    `${t.itemCount} Artikel`,
    `${t.units.toLocaleString('de-DE')} Einheiten`,
  ];
  if (t.eskuGroupCount > 0) parts.push(`${t.eskuGroupCount} ESKU-Gruppen`);
  return parts.join(' · ');
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l5 5 9-11"
            stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 8v5m0 3.5h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
