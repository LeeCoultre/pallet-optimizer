/* Einstellungen — System-Daten und Voreinstellungen.
   Design System v3 (siehe DESIGN.md). */

import { useAppState } from '../state.jsx';
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
          <Row label="Maximalvolumen" value="1,584 m³"     mono />
          <Row label="Maximalgewicht" value="700 kg"       mono isLast />
        </SettingsCard>

        {/* Branding */}
        <SettingsCard
          title="Branding"
          sub="Markenfarben und Stil-System v3."
          last
        >
          <Row label="Build" value="2.0.0" mono />
          <Row
            label="Akzentfarbe"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 14, height: 14,
                  background: T.accent.main,
                  borderRadius: 4,
                  border: `1px solid ${T.accent.border}`,
                }} />
                <span style={{ fontFamily: T.font.mono, fontSize: 13, color: T.text.primary }}>
                  {T.accent.main}
                </span>
              </span>
            }
          />
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
