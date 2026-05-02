/* Marathon · Design System v3 — переиспользуемые атомы.
   Spec: DESIGN.md. */

import { Wordmark } from './Logo.jsx';

/* ─── Tokens ─────────────────────────────────────────────────────────── */
export const T = {
  bg:     { page: '#F9FAFB', surface: '#FFFFFF', surface2: '#F9FAFB', surface3: '#F3F4F6' },
  border: { primary: '#E5E7EB', subtle: '#F3F4F6', strong: '#D1D5DB' },
  text:   { primary: '#111827', secondary: '#374151', muted: '#52525B', subtle: '#6B7280', faint: '#9CA3AF' },

  accent: { main: '#4F46E5', hover: '#4338CA', text: '#3730A3', bg: '#EEF2FF', border: '#C7D2FE' },

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

  radius: { sm: 4, md: 8, lg: 12, full: 9999 },
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
/* Sticky breadcrumb topbar. crumbs: [{ label, muted? }, ...] */
export function Topbar({ crumbs = [], right }) {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      height: 52,
      padding: '0 32px',
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
          <span style={{
            fontSize: 13,
            color: c.muted ? T.text.subtle : T.text.primary,
            fontWeight: 500,
          }}>
            {c.label}
          </span>
          {i < crumbs.length - 1 && <Sep />}
        </span>
      ))}
      <span style={{ flex: 1 }} />
      {right}
    </header>
  );
}

export function Sep() {
  return <span style={{ color: T.border.strong, fontSize: 12, margin: '0 4px' }}>/</span>;
}

/* ─── Stepper ────────────────────────────────────────────────────────── */
export const STEPS = [
  { n: 1, id: 'upload',    label: 'Upload',      sub: 'Datei laden' },
  { n: 2, id: 'pruefen',   label: 'Prüfen',      sub: 'Daten kontrollieren' },
  { n: 3, id: 'focus',     label: 'Focus-Modus', sub: 'Paletten bearbeiten' },
  { n: 4, id: 'abschluss', label: 'Abschluss',   sub: 'Zeit speichern' },
];

export function StepperBar({ active, steps = STEPS }) {
  return (
    <div style={{
      padding: '20px 32px',
      background: T.bg.surface,
      borderBottom: `1px solid ${T.border.primary}`,
    }}>
      <Stepper active={active} steps={steps} />
    </div>
  );
}

export function Stepper({ active, steps = STEPS }) {
  const activeIdx = steps.findIndex((s) => s.id === active);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 1180, margin: '0 auto' }}>
      {steps.map((s, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'todo';
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28, height: 28,
                borderRadius: '50%',
                background: state === 'current' ? T.accent.main
                  : state === 'done' ? T.status.success.main
                  : T.bg.surface3,
                color: state === 'todo' ? T.text.faint : '#fff',
                fontSize: 13,
                fontWeight: 600,
              }}>
                {state === 'done' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : s.n}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{
                  fontSize: 13.5,
                  fontWeight: state === 'current' ? 600 : 500,
                  color: state === 'todo' ? T.text.faint : T.text.primary,
                }}>{s.label}</span>
                <span style={{ fontSize: 11.5, color: T.text.subtle, marginTop: 2 }}>{s.sub}</span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <span style={{
                flex: 1,
                height: 1,
                margin: '0 16px',
                background: state === 'done' ? T.status.success.main : T.border.primary,
              }} />
            )}
          </div>
        );
      })}
    </div>
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
  height: 40,
  padding: '0 20px',
  borderRadius: T.radius.md,
  fontSize: 14,
  fontWeight: 500,
  fontFamily: T.font.ui,
  cursor: 'pointer',
  transition: 'background 150ms, border-color 150ms, color 150ms',
  whiteSpace: 'nowrap',
};

export function Button({ variant = 'primary', size = 'md', children, style, disabled, ...rest }) {
  const sizeStyle = size === 'sm'
    ? { height: 32, padding: '0 12px', fontSize: 13 }
    : size === 'lg'
    ? { height: 44, padding: '0 24px', fontSize: 15 }
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
