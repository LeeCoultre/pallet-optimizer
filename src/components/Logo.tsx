/* ─────────────────────────────────────────────────────────────────────────
   Marathon — brand mark + wordmark.

   Mark: black rounded square with three chevrons (» »); the third one
   uses the accent color so the icon stays in sync if the user customizes
   the accent palette in Einstellungen.

   The accent stroke reads `var(--accent)` (set in index.css and at runtime
   by applyAccent()), so retheming propagates without a re-render.
   ───────────────────────────────────────────────────────────────────────── */

export function Mark({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 503 503"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <rect width="503" height="503" rx="111" fill="black" />
      <path d="M128 147L218 252L128 357" stroke="#F3F1EC" strokeWidth="39" strokeLinecap="square" />
      <path d="M225 147L317 252L225 357" stroke="#F3F1EC" strokeWidth="39" strokeLinecap="square" />
      <path d="M324 147L414 252L324 357" stroke="var(--accent)" strokeWidth="39" strokeLinecap="square" />
    </svg>
  );
}

/* Wordmark: icon + "MARATHON" in display font, optional dot/tagline. */
export function Wordmark({ iconSize = 28, textSize = 16, color = 'var(--ink)', accentDot = false, tagline }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      lineHeight: 1,
    }}>
      <Mark size={iconSize} />
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
