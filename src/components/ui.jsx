/* Marathon · Design System v3 — переиспользуемые атомы.
   Spec: DESIGN.md. */

import { useEffect, useState } from 'react';
import { Wordmark } from './Logo.jsx';

/* ─── Tokens ─────────────────────────────────────────────────────────── */
export const T = {
  bg:     { page: '#F9FAFB', surface: '#FFFFFF', surface2: '#F9FAFB', surface3: '#F3F4F6' },
  border: { primary: '#E5E7EB', subtle: '#F3F4F6', strong: '#D1D5DB' },
  text:   { primary: '#111827', secondary: '#374151', muted: '#52525B', subtle: '#6B7280', faint: '#9CA3AF' },

  /* Accent reads CSS vars set by src/utils/accent.js — change the var,
     every component re-paints automatically without React re-rendering.
     Default palette derived from #FF5B1F (Marathon orange). */
  accent: {
    main:   'var(--accent)',
    hover:  'var(--accent-hover)',
    text:   'var(--accent-text)',
    bg:     'var(--accent-bg)',
    border: 'var(--accent-border)',
  },

  status: {
    success: { main: '#10B981', bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    warn:    { main: '#F59E0B', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
    danger:  { main: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  },

  category: {
    THERMO:     { color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
    PRODUKTION: { color: '#10B981', bg: '#ECFDF5', text: '#047857' },
    HEIPA:      { color: '#06B6D4', bg: '#ECFEFF', text: '#0E7490' },
    VEIT:       { color: '#A855F7', bg: '#FAF5FF', text: '#7E22CE' },
    TACHO:      { color: '#F97316', bg: '#FFF7ED', text: '#C2410C' },
    SONSTIGE:   { color: '#71717A', bg: '#FAFAFA', text: '#3F3F46' },
  },

  font: {
    ui:   'Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },

  radius: { sm: 4, md: 8, lg: 14, full: 9999 },
  shadow: {
    card:   '0 1px 2px rgba(0,0,0,0.03)',
    raised: '0 2px 8px rgba(0,0,0,0.06)',
    cta:    '0 1px 2px rgba(79,70,229,0.2)',
    modal:  '0 12px 40px rgba(0,0,0,0.15)',
  },
};

/* ─── Page shell ─────────────────────────────────────────────────────── */
/* Page-level wrapper — sets canvas bg, font and reset */
export function Page({ children, style }) {
  return (
    <div style={{
      background: T.bg.page,
      minHeight: '100vh',
      fontFamily: T.font.ui,
      color: T.text.primary,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── Topbar ─────────────────────────────────────────────────────────── */
/* Sticky breadcrumb topbar.
   crumbs: [{ label, muted?, onClick?, title? }, ...]
   If a crumb has onClick → renders as clickable Crumb (hover lift,
   accent on hover). The last crumb stays passive even if onClick set. */
export function Topbar({ crumbs = [], right }) {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      height: 60,
      padding: '0 40px',
      background: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.border.primary}`,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Crumb crumb={c} isLast={i === crumbs.length - 1} />
          {i < crumbs.length - 1 && <Sep />}
        </span>
      ))}
      <span style={{ flex: 1 }} />
      {right}
    </header>
  );
}

function Crumb({ crumb, isLast }) {
  const [hover, setHover] = useState(false);
  const interactive = !!crumb.onClick && !isLast;
  const baseColor = isLast
    ? T.text.primary
    : crumb.muted ? T.text.subtle : T.text.primary;
  const color = interactive && hover ? T.accent.text : baseColor;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={crumb.onClick}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={crumb.title || `Zu ${crumb.label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          margin: '0 -10px',
          fontSize: 14.5,
          fontWeight: 500,
          fontFamily: 'inherit',
          color,
          background: hover ? T.accent.bg : 'transparent',
          border: 'none',
          borderRadius: T.radius.sm,
          cursor: 'pointer',
          transition: 'color 160ms ease, background 160ms ease',
        }}
      >
        {crumb.label}
      </button>
    );
  }

  return (
    <span style={{
      fontSize: 14.5,
      color: baseColor,
      fontWeight: isLast ? 600 : 500,
    }}>
      {crumb.label}
    </span>
  );
}

export function Sep() {
  return <span style={{ color: T.border.strong, fontSize: 13, margin: '0 5px' }}>/</span>;
}

/* ─── Stepper (Live Progress Line) ───────────────────────────────────────
   Single continuous line through all 4 circles (background grey + accent
   fill that animates to the current step). Three circle states:
     done    — accent-filled circle with check (fade-in), label primary
     current — accent-filled circle with number + breathing pulse halo
     todo    — outline circle with number, faded label

   Mount-time stagger: circles fade-scale-in 60ms apart, then the
   accent fill-line slides to its position. Designed to feel alive on
   navigation, not just static.
──────────────────────────────────────────────────────────────────────── */
export const STEPS = [
  { n: 1, id: 'upload',    label: 'Upload',      sub: 'Datei laden' },
  { n: 2, id: 'pruefen',   label: 'Prüfen',      sub: 'Daten kontrollieren' },
  { n: 3, id: 'focus',     label: 'Focus-Modus', sub: 'Paletten bearbeiten' },
  { n: 4, id: 'abschluss', label: 'Abschluss',   sub: 'Zeit speichern' },
];

/* StepperBar — workflow tabs.

   Pass `onNavigate(stepId)` to make tabs clickable. By default ANY step
   that is not the current one is navigable (parent screen owns the
   workflow rules); to override, pass `canNavigate(stepId) → boolean`.

   When `onNavigate` is provided, also installs Alt+1..4 shortcuts at
   document level so the worker can jump tabs without leaving the
   keyboard. The shortcut handler is auto-cleaned on unmount. */
export function StepperBar({ active, steps = STEPS, onNavigate, canNavigate }) {
  // Alt+1..4 keyboard navigation — only when onNavigate is wired.
  useEffect(() => {
    if (!onNavigate) return undefined;
    const onKey = (e) => {
      if (!e.altKey) return;
      const t = e.target;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (t?.isContentEditable) return;
      const idx = parseInt(e.key, 10) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx >= steps.length) return;
      const target = steps[idx];
      if (!target || target.id === active) return;
      const allowed = canNavigate ? canNavigate(target.id) : true;
      if (!allowed) return;
      e.preventDefault();
      onNavigate(target.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, steps, onNavigate, canNavigate]);

  return (
    <div style={{
      padding: '18px 32px 20px',
      background: 'transparent',
      borderBottom: `1px solid ${T.border.primary}`,
    }}>
      <StepperKeyframes />
      <Stepper
        active={active}
        steps={steps}
        onNavigate={onNavigate}
        canNavigate={canNavigate}
      />
    </div>
  );
}

/* Local keyframes scoped to this component family. Re-mounted with
   StepperBar; keys are namespaced (mp-stp-*) so they can't clash. */
function StepperKeyframes() {
  return (
    <style>{`
      @keyframes mp-stp-pop {
        0%   { opacity: 0; transform: scale(0.85); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes mp-stp-pulse {
        0%   { box-shadow: 0 0 0 0   var(--accent, #FF5B1F); opacity: 0.55; }
        70%  { box-shadow: 0 0 0 9px transparent; opacity: 0; }
        100% { box-shadow: 0 0 0 0   transparent; opacity: 0; }
      }
      @keyframes mp-stp-check {
        0%   { opacity: 0; transform: scale(0.6); }
        60%  { opacity: 1; transform: scale(1.1); }
        100% { opacity: 1; transform: scale(1); }
      }
    `}</style>
  );
}

export function Stepper({ active, steps = STEPS, onNavigate, canNavigate }) {
  const activeIdx = steps.findIndex((s) => s.id === active);
  const n = steps.length;

  /* Continuous progress line geometry — circle centers sit at
     (i + 0.5) / n of the row width. The line stretches from the
     first to the last center; the fill width is proportional to
     activeIdx. */
  const trackLeftPct = 50 / n;                    // left of background
  const trackWidthPct = ((n - 1) / n) * 100;      // background full width
  const fillWidthPct = (activeIdx / n) * 100;     // accent fill width

  return (
    <div style={{
      maxWidth: 1080,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Background track (full grey hairline through all circles) */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: `${trackLeftPct}%`,
          width: `${trackWidthPct}%`,
          top: 16,                                /* half of 32px circle */
          height: 1,
          background: T.border.primary,
          zIndex: 0,
        }}
      />
      {/* Accent fill — animates to current position */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: `${trackLeftPct}%`,
          width: `${fillWidthPct}%`,
          top: 16,
          height: 1,
          background: T.accent.main,
          zIndex: 1,
          transition: 'width 480ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${n}, 1fr)`,
        alignItems: 'flex-start',
        position: 'relative',
        zIndex: 2,
      }}>
        {steps.map((s, i) => {
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'todo';
          const isCurrent = state === 'current';
          /* Clickable when onNavigate is wired and either canNavigate
             allows it OR (default) it's any non-current step. */
          let clickable = false;
          if (onNavigate && !isCurrent) {
            clickable = canNavigate ? !!canNavigate(s.id) : true;
          }
          const isBlocked = onNavigate && !isCurrent && !clickable;
          return (
            <StepCell
              key={s.id}
              step={s}
              state={state}
              mountDelayMs={i * 60}
              clickable={clickable}
              isBlocked={isBlocked}
              shortcut={i + 1}
              onClick={clickable ? () => onNavigate(s.id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function StepCell({
  step, state, mountDelayMs = 0,
  clickable = false, isBlocked = false, shortcut = null, onClick,
}) {
  const isDone = state === 'done';
  const isCurrent = state === 'current';
  const [hover, setHover] = useState(false);

  const circleBg = isDone || isCurrent ? T.accent.main : T.bg.surface;
  const circleColor = isDone || isCurrent ? '#fff' : T.text.faint;
  const circleBorder = isDone || isCurrent ? T.accent.main : T.border.strong;

  const labelColor = (isCurrent || isDone) ? T.text.primary : T.text.faint;
  const labelWeight = isCurrent ? 600 : 500;
  const subColor = (isCurrent || isDone) ? T.text.subtle : T.text.faint;

  const Wrapper = clickable ? 'button' : 'div';
  const wrapperProps = clickable ? {
    type: 'button',
    onClick,
    onMouseDown: (e) => e.preventDefault(),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    title: `Zu ${step.label}` + (shortcut ? ` (Alt+${shortcut})` : ''),
  } : {
    title: isCurrent
      ? `Aktueller Schritt: ${step.label}`
      : isBlocked ? `${step.label} — noch nicht verfügbar`
      : step.label,
  };

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        position: 'relative',
        animation: `mp-stp-pop 320ms cubic-bezier(0.16, 1, 0.3, 1) ${mountDelayMs}ms backwards`,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: clickable ? 'pointer' : isBlocked ? 'not-allowed' : 'default',
        opacity: isBlocked ? 0.55 : 1,
        fontFamily: 'inherit',
        textAlign: 'center',
      }}>
      {/* Circle row — must be first child so its center sits at top: 16px,
          which is exactly where the progress line is drawn. */}
      <div style={{
        position: 'relative',
        width: 32,
        height: 32,
        flexShrink: 0,
      }}>
        {isCurrent && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              animation: 'mp-stp-pulse 2.4s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
        <span style={{
          position: 'relative',
          zIndex: 2,
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: circleBg,
          color: circleColor,
          border: `1px solid ${clickable && hover ? T.accent.hover : circleBorder}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: T.font.ui,
          fontVariantNumeric: 'tabular-nums',
          transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isCurrent
            ? `0 0 0 5px ${T.accent.bg}`
            : (clickable && hover) ? `0 0 0 5px ${T.accent.bg}` : 'none',
          transform: clickable && hover ? 'translateY(-2px) scale(1.04)' : 'none',
        }}>
          {isDone ? (
            <svg
              key="check"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ animation: 'mp-stp-check 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              <path d="M3 7l3 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : step.n}
        </span>
      </div>

      {/* Label + sub stacked under circle, centered. Live-region for
          screen readers can be added later if needed. */}
      <div style={{
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: labelWeight,
          color: labelColor,
          letterSpacing: '-0.005em',
          transition: 'color 240ms',
        }}>
          {step.label}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 12,
          color: subColor,
          fontWeight: 400,
          lineHeight: 1.3,
          transition: 'color 240ms',
        }}>
          {step.sub}
        </div>
      </div>
    </Wrapper>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────── */
export function Card({ children, style, padding }) {
  return (
    <div style={{
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      boxShadow: T.shadow.card,
      ...(padding != null ? { padding } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── Section header ─────────────────────────────────────────────────── */
export function SectionHeader({ title, sub, right }) {
  return (
    <div style={{
      marginBottom: 14,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 600,
          color: T.text.primary,
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h2>
        {sub && (
          <p style={{
            fontSize: 13.5,
            color: T.text.subtle,
            margin: '4px 0 0',
            lineHeight: 1.5,
          }}>
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

/* ─── Eyebrow (мини-метка над H1) ────────────────────────────────────── */
export function Eyebrow({ children }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      fontWeight: 500,
      color: T.text.subtle,
      marginBottom: 12,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent.main }} />
      {children}
    </div>
  );
}

/* ─── H1 / Lead ──────────────────────────────────────────────────────── */
export function PageH1({ children }) {
  return (
    <h1 style={{
      fontFamily: T.font.ui,
      fontSize: 'clamp(28px, 3.6vw, 40px)',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      lineHeight: 1.15,
      color: T.text.primary,
      margin: 0,
    }}>
      {children}
    </h1>
  );
}

export function Lead({ children, style }) {
  return (
    <p style={{
      marginTop: 12,
      fontSize: 15,
      lineHeight: 1.55,
      color: T.text.muted,
      maxWidth: 640,
      margin: '12px 0 0',
      ...style,
    }}>
      {children}
    </p>
  );
}

/* ─── Label (uppercase mini-meta) ────────────────────────────────────── */
export function Label({ children }) {
  return (
    <span style={{
      fontSize: 11.5,
      fontWeight: 500,
      color: T.text.subtle,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {children}
    </span>
  );
}

/* ─── Meta (label + value pair) ──────────────────────────────────────── */
export function Meta({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: T.text.subtle, fontWeight: 500, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? T.font.mono : 'inherit',
        fontSize: 14,
        fontWeight: 500,
        color: T.text.primary,
      }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Badge / Pill ───────────────────────────────────────────────────── */
export function Badge({ children, tone, color, bg, text }) {
  let styles;
  if (color) {
    styles = { background: bg, color: text, borderColor: color + '40' };
  } else {
    styles = {
      success: { background: T.status.success.bg, color: T.status.success.text, borderColor: T.status.success.border },
      warn:    { background: T.status.warn.bg,    color: T.status.warn.text,    borderColor: T.status.warn.border },
      danger:  { background: T.status.danger.bg,  color: T.status.danger.text,  borderColor: T.status.danger.border },
      accent:  { background: T.accent.bg,         color: T.accent.text,         borderColor: T.accent.border },
      neutral: { background: T.bg.surface3,       color: T.text.secondary,      borderColor: T.border.primary },
    }[tone] || { background: T.bg.surface3, color: T.text.secondary, borderColor: T.border.primary };
  }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: T.radius.full,
      border: `1px solid ${styles.borderColor}`,
      background: styles.background,
      color: styles.color,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/* ─── Buttons ────────────────────────────────────────────────────────── */
const baseBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 44,
  padding: '0 22px',
  borderRadius: T.radius.md,
  fontSize: 15,
  fontWeight: 500,
  fontFamily: T.font.ui,
  cursor: 'pointer',
  transition: 'background 150ms, border-color 150ms, color 150ms',
  whiteSpace: 'nowrap',
};

export function Button({ variant = 'primary', size = 'md', children, style, disabled, ...rest }) {
  const sizeStyle = size === 'sm'
    ? { height: 36, padding: '0 14px', fontSize: 13.5 }
    : size === 'lg'
    ? { height: 48, padding: '0 26px', fontSize: 16 }
    : {};

  let variantStyle;
  if (variant === 'primary') {
    variantStyle = {
      background: T.accent.main,
      color: '#fff',
      border: 0,
      boxShadow: T.shadow.cta,
    };
  } else if (variant === 'ghost') {
    variantStyle = {
      background: T.bg.surface,
      color: T.text.secondary,
      border: `1px solid ${T.border.strong}`,
    };
  } else if (variant === 'danger') {
    variantStyle = {
      background: T.bg.surface,
      color: T.status.danger.text,
      border: `1px solid ${T.status.danger.border}`,
    };
  } else if (variant === 'subtle') {
    variantStyle = {
      background: 'transparent',
      color: T.text.subtle,
      border: 0,
      padding: '0 8px',
      fontSize: 13,
    };
  }

  const onMouseEnter = (e) => {
    if (disabled) return;
    if (variant === 'primary') e.currentTarget.style.background = T.accent.hover;
    else if (variant === 'ghost') {
      e.currentTarget.style.background = T.bg.surface2;
      e.currentTarget.style.borderColor = T.text.faint;
    }
    else if (variant === 'danger') e.currentTarget.style.background = T.status.danger.bg;
    else if (variant === 'subtle') e.currentTarget.style.color = T.text.secondary;
  };
  const onMouseLeave = (e) => {
    if (variant === 'primary') e.currentTarget.style.background = T.accent.main;
    else if (variant === 'ghost') {
      e.currentTarget.style.background = T.bg.surface;
      e.currentTarget.style.borderColor = T.border.strong;
    }
    else if (variant === 'danger') e.currentTarget.style.background = T.bg.surface;
    else if (variant === 'subtle') e.currentTarget.style.color = T.text.subtle;
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        ...baseBtn,
        ...variantStyle,
        ...sizeStyle,
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── KPI card ───────────────────────────────────────────────────────── */
export function Kpi({ label, value, sub, tone }) {
  const valueColor = tone === 'accent'  ? T.accent.main
    : tone === 'danger'  ? T.status.danger.main
    : tone === 'warn'    ? T.status.warn.main
    : tone === 'success' ? T.status.success.main
    : T.text.primary;
  return (
    <div style={{
      padding: '18px 20px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      boxShadow: T.shadow.card,
    }}>
      <div style={{ fontSize: 12, color: T.text.subtle, fontWeight: 500, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: '-0.025em',
        color: valueColor,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: T.text.subtle, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Validation banner ──────────────────────────────────────────────── */
export function ValidationBanner({ tone = 'success', title, sub, action }) {
  const palette = T.status[tone] || T.status.success;
  const icon = tone === 'success' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l5 5 9-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : tone === 'warn' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 8v5m0 3.5h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6m0 3.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 20px',
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: T.radius.lg,
    }}>
      <span style={{
        width: 32, height: 32,
        borderRadius: '50%',
        background: palette.main,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 12.5, color: palette.text, opacity: 0.85, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{
      padding: '64px 32px',
      background: T.bg.page,
      border: `1px dashed ${T.border.strong}`,
      borderRadius: T.radius.lg,
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{ display: 'inline-flex', color: T.text.faint, marginBottom: 16 }}>
          {icon}
        </div>
      )}
      {title && (
        <h3 style={{
          fontSize: 18,
          fontWeight: 600,
          color: T.text.primary,
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {title}
        </h3>
      )}
      {description && (
        <p style={{
          fontSize: 14,
          color: T.text.subtle,
          maxWidth: 420,
          margin: '8px auto 24px',
          lineHeight: 1.55,
        }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

/* ─── Wordmark re-export ─────────────────────────────────────────────── */
export { Wordmark };
