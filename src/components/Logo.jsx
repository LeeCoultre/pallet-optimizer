/* ─────────────────────────────────────────────────────────────────────────
   Marathon — brand mark + wordmark.
   Mark   = standalone icon (sailboat-ish geometry)
   Wordmark = icon + "MARATHON" text in display font
   Source: public/brand/marathon-icon.svg + marathon-wordmark.svg
   ───────────────────────────────────────────────────────────────────────── */

export function Mark({ size = 28, color = '#0A0A0B', bg }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 503 503"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {bg && <rect width="503" height="503" rx="70" fill={bg} />}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M249.984 98L89.2911 296.417C80.3756 307.426 80.3756 323.17 89.2911 334.179L146.647 405L322.632 187.702L249.984 98ZM146.647 331.217L133.754 315.298L249.984 171.783L262.876 187.701L146.647 331.217Z"
        fill={color}
      />
      <path
        d="M408.624 387.569C435.792 354.023 435.792 312.692 408.624 279.146L363.894 223.913C353.935 211.616 329.036 211.616 319.077 223.912L276.307 276.724C271.686 282.431 271.686 289.463 276.307 295.17L357.475 395.391C367.434 407.687 392.332 407.688 402.291 395.391L408.624 387.569Z"
        fill={color}
      />
      <path
        d="M253.061 318.445L181.647 405H328.777L253.061 318.445Z"
        fill={color}
      />
    </svg>
  );
}

/* Wordmark: icon + "MARATHON" rendered as proper typography (so it scales &
   inherits font features), with optional accent dot or tagline. */
export function Wordmark({ iconSize = 28, textSize = 16, color = 'var(--ink)', accentDot = false, tagline }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      lineHeight: 1,
    }}>
      <Mark size={iconSize} color={color === 'var(--ink)' ? '#0A0A0B' : color} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: textSize,
          fontWeight: 800,
          letterSpacing: '0.04em',
          color,
          textTransform: 'uppercase',
        }}>
          Marathon{accentDot && <span style={{ color: 'var(--accent)' }}>.</span>}
        </span>
        {tagline && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: Math.max(8, textSize * 0.55),
            letterSpacing: '0.22em',
            color: 'var(--ink-3)',
            marginTop: 4,
            textTransform: 'uppercase',
          }}>
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
