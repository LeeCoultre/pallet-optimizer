/* Einstellungen — System-Daten und Voreinstellungen.
   Design System v3 (siehe DESIGN.md). */

import { useState } from 'react';
import { useAppState } from '../state.jsx';
import {
  applyAccent, getStoredAccent, setStoredAccent, resetAccent, DEFAULT_ACCENT,
} from '../utils/accent.js';
import {
  EXPERIMENT_META, useExperiment,
} from '../utils/experiments.js';
import {
  Page, Topbar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Button, T,
} from '../components/ui.jsx';

export default function EinstellungenScreen() {
  const { queue, history, clearQueue, clearHistory } = useAppState();

  return (
    <Page>
      <Topbar
        crumbs={[
          { label: 'Workspace', muted: true },
          { label: 'Einstellungen' },
        ]}
        right={<span style={{ fontSize: 12, color: T.text.subtle }}>System</span>}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Page intro */}
        <section style={{ marginBottom: 32 }}>
          <Eyebrow>Workspace · Einstellungen</Eyebrow>
          <PageH1>Einstellungen</PageH1>
          <Lead>
            System-Daten und Voreinstellungen. Der Funktionsumfang wird in einer
            kommenden Version erweitert — derzeit ist alles read-only.
          </Lead>
        </section>

        {/* Daten */}
        <SettingsCard
          title="Daten"
          sub="Aufträge und Historie liegen in der gemeinsamen PostgreSQL-Datenbank. Änderungen sind sofort für alle Benutzer sichtbar."
        >
          <Row label="Aufträge in Warteschlange" value={queue.length} mono>
            {queue.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => { if (confirm('Warteschlange wirklich leeren?')) clearQueue(); }}
              >
                Leeren
              </Button>
            )}
          </Row>
          <Row label="Abgeschlossene Aufträge" value={history.length} mono>
            {history.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => { if (confirm('Historie wirklich löschen? (Nur Admin)')) clearHistory(); }}
              >
                Löschen
              </Button>
            )}
          </Row>
          <Row label="Storage-Engine" value="PostgreSQL · FastAPI" isLast />
        </SettingsCard>

        {/* Zeitschätzungen */}
        <SettingsCard
          title="Zeitschätzungen"
          sub="Werte für die Dauer-Schätzung im Prüfen-Schritt. (Konfigurierbar in einer kommenden Version.)"
        >
          <Row label="Pro Palette · Basis"     value="6 min" mono />
          <Row label="Pro Artikel"             value="11 s"  mono />
          <Row label="Pro Tacho-Artikel"       value="21 s"  mono />
          <Row label="Pause zwischen Paletten" value="9 min" mono isLast />
        </SettingsCard>

        {/* Euro-Palette */}
        <SettingsCard
          title="Euro-Palette"
          sub="Geometrie und Limits für die Auslastungsberechnung."
        >
          <Row label="Bodenfläche"  value="1.200 × 800 mm" mono />
          <Row label="Maximalhöhe"  value="1.650 mm"       mono />
          <Row label="Maximalvolumen" value="1,584 m³"     mono isLast />
        </SettingsCard>

        {/* Experimente */}
        <SettingsCard
          title="Experimente"
          sub="Funktionen in Erprobung. Standardmäßig deaktiviert — schaltest du selbst frei, wenn du sie ausprobieren möchtest. Deaktivieren ist jederzeit möglich, kein Datenverlust."
        >
          <ExperimentRow flag="dynamicIsland" isLast />
        </SettingsCard>

        {/* Branding */}
        <SettingsCard
          title="Branding"
          sub="Markenfarben und Stil-System v3."
          last
        >
          <Row label="Build" value="2.0.0" mono />
          <AccentRow />
          <Row label="Schriften"     value="Inter · JetBrains Mono" />
          <Row label="Design-System" value="Marathon · v3" mono isLast />
        </SettingsCard>

      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function SettingsCard({ title, sub, children, last }) {
  return (
    <section style={{ marginBottom: last ? 0 : 16 }}>
      <SectionHeader title={title} sub={sub} />
      <Card style={{ padding: '6px 24px' }}>
        {children}
      </Card>
    </section>
  );
}

/* ── Akzentfarbe row — color picker that drives the CSS-var palette.
   Live preview on every keystroke, persists to localStorage on commit
   (or onBlur for the hex text input). Reset returns to brand default. */
function AccentRow() {
  const [color, setColor] = useState(getStoredAccent);
  const PRESETS = [
    DEFAULT_ACCENT,   // Marathon orange
    '#5B62D8',        // indigo (legacy)
    '#10B981',        // emerald
    '#0EA5E9',        // sky
    '#A855F7',        // violet
    '#EC4899',        // pink
    '#0A0A0B',        // black
  ];

  const apply = (next) => {
    setColor(next);
    applyAccent(next);
    setStoredAccent(next);
  };

  const onText = (raw) => {
    /* Live preview but only persist if it parses as a 6-digit hex. */
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    setColor(hex.toUpperCase());
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyAccent(hex);
      setStoredAccent(hex);
    }
  };

  const onReset = () => setColor(resetAccent());

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: `1px solid ${T.border.subtle}`,
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 13.5, color: T.text.secondary, minWidth: 120 }}>
        Akzentfarbe
      </span>

      {/* Native picker */}
      <input
        type="color"
        value={color}
        onChange={(e) => apply(e.target.value.toUpperCase())}
        style={{
          width: 36, height: 36,
          padding: 0, border: `1px solid ${T.border.strong}`,
          borderRadius: T.radius.sm, cursor: 'pointer',
          background: 'transparent',
        }}
        title="Klicke, um eine Farbe zu wählen"
      />

      {/* Hex text */}
      <input
        type="text"
        value={color}
        onChange={(e) => onText(e.target.value)}
        spellCheck={false}
        style={{
          width: 100,
          padding: '6px 10px',
          border: `1px solid ${T.border.strong}`,
          borderRadius: T.radius.sm,
          fontFamily: T.font.mono,
          fontSize: 13,
          color: T.text.primary,
          background: T.bg.surface,
          outline: 'none',
          textTransform: 'uppercase',
        }}
      />

      {/* Presets */}
      <div style={{ display: 'inline-flex', gap: 6 }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => apply(p)}
            title={p}
            style={{
              width: 22, height: 22,
              borderRadius: '50%',
              background: p,
              border: color.toUpperCase() === p.toUpperCase()
                ? `2px solid ${T.text.primary}`
                : `1px solid ${T.border.strong}`,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      <span style={{ flex: 1 }} />

      {color.toUpperCase() !== DEFAULT_ACCENT.toUpperCase() && (
        <Button variant="subtle" size="sm" onClick={onReset}>
          Zurücksetzen
        </Button>
      )}
    </div>
  );
}

/* ── Experiment row — toggle for opt-in features. Reads description
   from EXPERIMENT_META so the registry of available flags lives in
   one place (src/utils/experiments.js). ───────────────────────────── */
function ExperimentRow({ flag, isLast }) {
  const [enabled, setEnabled] = useExperiment(flag);
  const meta = EXPERIMENT_META[flag] || { label: flag, description: '' };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 0',
      borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text.primary }}>
            {meta.label}
          </span>
          {meta.badge && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.accent.text,
              background: T.accent.bg,
              border: `1px solid ${T.accent.border}`,
              padding: '1px 6px',
              borderRadius: 999,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {meta.badge}
            </span>
          )}
        </div>
        {meta.description && (
          <p style={{
            margin: 0,
            fontSize: 12.5,
            color: T.text.subtle,
            lineHeight: 1.5,
            letterSpacing: '-0.005em',
            maxWidth: 560,
          }}>
            {meta.description}
          </p>
        )}
      </div>
      <Toggle checked={enabled} onChange={setEnabled} ariaLabel={meta.label} />
    </div>
  );
}

/* iOS-style toggle. Click anywhere on the pill switches. Accent CSS
   var when on so it picks up the user's chosen brand colour. */
function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0,
        width: 40,
        height: 24,
        borderRadius: 999,
        background: checked ? `var(--accent, ${T.accent.main})` : T.bg.surface3,
        border: `1px solid ${checked ? `var(--accent, ${T.accent.main})` : T.border.primary}`,
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
        transition: 'left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }} />
    </button>
  );
}

function Row({ label, value, mono, children, isLast }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
      gap: 16,
    }}>
      <span style={{ fontSize: 13.5, color: T.text.secondary }}>
        {label}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: mono ? T.font.mono : 'inherit',
        fontSize: 13.5,
        fontWeight: 500,
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
      {children}
    </div>
  );
}
