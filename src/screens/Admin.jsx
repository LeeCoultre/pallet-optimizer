/* Admin panel — gated by useMe().role === 'admin'.
   Four tabs: Aufträge | Benutzer | Audit-Log | KPIs. */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMe } from '../hooks/useMe.js';
import {
  adminListAuftraege,
  adminListUsers,
  adminChangeUserRole,
  adminListAudit,
  adminGetStats,
} from '../marathonApi.js';
import {
  Page, Topbar, Card, SectionHeader, Eyebrow, PageH1, Lead, Badge, Kpi, T,
} from '../components/ui.jsx';

const TABS = [
  { id: 'auftraege', label: 'Aufträge'   },
  { id: 'users',     label: 'Benutzer'   },
  { id: 'audit',     label: 'Audit-Log'  },
  { id: 'kpi',       label: 'KPIs'       },
];

export default function AdminScreen() {
  const meQ = useMe();
  const [tab, setTab] = useState('auftraege');

  if (meQ.isLoading) {
    return <Page><PadCenter>Lade…</PadCenter></Page>;
  }
  if (meQ.data?.role !== 'admin') {
    return <Page><Forbidden /></Page>;
  }

  return (
    <Page>
      <Topbar
        crumbs={[
          { label: 'Workspace', muted: true },
          { label: 'Admin' },
        ]}
        right={<Badge tone="accent">Admin</Badge>}
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 80px' }}>
        <section style={{ marginBottom: 24 }}>
          <Eyebrow>System · Admin</Eyebrow>
          <PageH1>Admin-Panel</PageH1>
          <Lead>
            Übersicht über alle Aufträge, Benutzer, Audit-Log und KPIs.
            Sichtbar nur für Admins.
          </Lead>
        </section>

        <TabBar tabs={TABS} active={tab} onSelect={setTab} />

        <div style={{ marginTop: 24 }}>
          {tab === 'auftraege' && <AuftraegeTab />}
          {tab === 'users'     && <UsersTab />}
          {tab === 'audit'     && <AuditTab />}
          {tab === 'kpi'       && <KpiTab />}
        </div>
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: ALL AUFTRAEGE  (status filter + file_name search)
   ════════════════════════════════════════════════════════════════════════ */

function AuftraegeTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'auftraege', statusFilter, search],
    queryFn: () => adminListAuftraege({ status: statusFilter, search, limit: 100 }),
    refetchInterval: 5000,
  });

  return (
    <div>
      <FilterBar>
        <Select
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '',            label: 'Alle' },
            { value: 'queued',      label: 'In Warteschlange' },
            { value: 'in_progress', label: 'In Bearbeitung' },
            { value: 'completed',   label: 'Abgeschlossen' },
            { value: 'error',       label: 'Fehler' },
          ]}
        />
        <Input
          label="Suche (Datei)"
          value={search}
          onChange={setSearch}
          placeholder="z.B. FBA15…"
        />
        <Total count={q.data?.total} loading={q.isLoading} />
      </FilterBar>

      <DataTable
        columns={[
          { key: 'fba_code',     label: 'FBA',       w: 140, render: r => r.fbaCode || '—', mono: true },
          { key: 'file_name',    label: 'Datei',     w: 280, render: r => r.fileName },
          { key: 'status',       label: 'Status',    w: 130, render: r => <StatusBadge status={r.status} /> },
          { key: 'pallets',      label: 'Pal.',      w: 60,  render: r => r.palletCount, mono: true, align: 'right' },
          { key: 'articles',     label: 'Art.',      w: 60,  render: r => r.articleCount, mono: true, align: 'right' },
          { key: 'assigned',     label: 'Bearbeiter', w: 130, render: r => r.assignedToUserName || '—' },
          { key: 'duration',     label: 'Dauer',     w: 80,  render: r => r.durationSec != null ? formatDuration(r.durationSec) : '—', align: 'right' },
          { key: 'finished',     label: 'Abgeschl.', w: 140, render: r => r.finishedAt ? formatDateTime(r.finishedAt) : '—' },
        ]}
        items={q.data?.items}
        loading={q.isLoading}
        empty="Keine Aufträge gefunden."
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: USERS  (role toggle)
   ════════════════════════════════════════════════════════════════════════ */

function UsersTab() {
  const meQ = useMe();
  const qc = useQueryClient();
  const usersQ = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminListUsers,
    refetchInterval: false,
  });
  const roleMut = useMutation({
    mutationFn: ({ id, role }) => adminChangeUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (err) => alert(err?.message || 'Fehler beim Ändern der Rolle'),
  });

  const onToggle = (u) => {
    const next = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Rolle für ${u.name} ändern: ${u.role} → ${next}?`)) return;
    roleMut.mutate({ id: u.id, role: next });
  };

  return (
    <DataTable
      columns={[
        { key: 'name',  label: 'Name',  w: 180, render: r => r.name },
        { key: 'email', label: 'Email', w: 260, render: r => r.email, mono: true },
        { key: 'role',  label: 'Rolle', w: 110, render: r => <RoleBadge role={r.role} /> },
        { key: 'completed', label: 'Aufträge', w: 90, render: r => r.auftraegeCompleted, mono: true, align: 'right' },
        { key: 'last',  label: 'Letzter Login', w: 150, render: r => r.lastLoginAt ? formatDateTime(r.lastLoginAt) : '—' },
        {
          key: 'action', label: '', w: 140,
          render: (r) => (
            <button
              onClick={() => onToggle(r)}
              disabled={r.id === meQ.data?.id && r.role === 'admin'}
              title={r.id === meQ.data?.id && r.role === 'admin' ? 'Du kannst dich nicht selbst herabstufen' : undefined}
              style={smallBtn}
            >
              {r.role === 'admin' ? '→ Mitarbeiter' : '→ Admin'}
            </button>
          ),
        },
      ]}
      items={usersQ.data}
      loading={usersQ.isLoading}
      empty="Keine Benutzer."
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: AUDIT LOG
   ════════════════════════════════════════════════════════════════════════ */

function AuditTab() {
  const [actionFilter, setActionFilter] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'audit', actionFilter],
    queryFn: () => adminListAudit({ action: actionFilter, limit: 200 }),
    refetchInterval: 5000,
  });

  return (
    <div>
      <FilterBar>
        <Select
          label="Aktion"
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: '',                 label: 'Alle' },
            { value: 'upload',           label: 'Upload' },
            { value: 'start',            label: 'Start' },
            { value: 'complete',         label: 'Complete' },
            { value: 'cancel',           label: 'Cancel' },
            { value: 'delete',           label: 'Delete' },
            { value: 'history_delete',   label: 'History delete' },
            { value: 'user_role_change', label: 'Rolle geändert' },
          ]}
        />
        <Total count={q.data?.total} loading={q.isLoading} />
      </FilterBar>

      <DataTable
        columns={[
          { key: 'time',    label: 'Zeit',     w: 150, render: r => formatDateTime(r.createdAt) },
          { key: 'user',    label: 'Benutzer', w: 140, render: r => r.userName || '—' },
          { key: 'action',  label: 'Aktion',   w: 140, render: r => <ActionBadge action={r.action} /> },
          { key: 'auftrag', label: 'Auftrag',  w: 200, render: r => r.auftragFileName || '—', mono: true },
          { key: 'meta',    label: 'Meta',     w: 300, render: r => <MetaCell meta={r.meta} /> },
        ]}
        items={q.data?.items}
        loading={q.isLoading}
        empty="Keine Einträge."
      />
    </div>
  );
}

function MetaCell({ meta }) {
  if (!meta || Object.keys(meta).length === 0) return '—';
  const entries = Object.entries(meta).slice(0, 3);
  return (
    <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.subtle }}>
      {entries.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}
      {Object.keys(meta).length > 3 && ' …'}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: KPI
   ════════════════════════════════════════════════════════════════════════ */

function KpiTab() {
  const q = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminGetStats,
    refetchInterval: 30000,
  });

  if (q.isLoading) return <PadCenter>Lade…</PadCenter>;
  if (q.isError)   return <PadCenter>Fehler beim Laden.</PadCenter>;

  const s = q.data;
  return (
    <div>
      {/* Top row: live status */}
      <SectionHeader title="Aktuell" sub="Was gerade läuft." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <Kpi label="In Warteschlange" value={s.queuedNow}      sub="zu erledigen" />
        <Kpi label="In Bearbeitung"   value={s.inProgressNow}  sub="aktiv"        tone="warn" />
        <Kpi label="Abgeschlossen total" value={s.completedTotal} sub="alle Zeit" tone="success" />
      </div>

      {/* Throughput */}
      <SectionHeader title="Durchsatz" sub="Letzte 7 Tage." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <Kpi label="Heute"            value={s.completedToday}    sub="abgeschlossen" />
        <Kpi label="Diese Woche"      value={s.completedThisWeek} sub="abgeschlossen" />
        <Kpi
          label="Ø Bearbeitungszeit"
          value={s.avgDurationSec != null ? formatDuration(Math.round(s.avgDurationSec)) : '—'}
          sub="pro Auftrag"
        />
      </div>

      {/* Top users */}
      <SectionHeader title="Top-Bearbeiter" sub="Nach Anzahl abgeschlossener Aufträge." />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          columns={[
            { key: 'rank', label: '#',     w: 40,  render: (_, i) => i + 1, mono: true, align: 'right' },
            { key: 'name', label: 'Name',  w: 200, render: r => r.name },
            { key: 'count', label: 'Aufträge', w: 100, render: r => r.count, mono: true, align: 'right' },
            { key: 'total', label: 'Gesamtzeit', w: 120, render: r => formatDuration(r.totalSeconds), align: 'right' },
            { key: 'avg', label: 'Ø Zeit', w: 100, render: r => r.count > 0 ? formatDuration(Math.round(r.totalSeconds / r.count)) : '—', align: 'right' },
          ]}
          items={s.topUsers}
          loading={false}
          empty="Noch keine abgeschlossenen Aufträge."
          flat
        />
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SHARED UI HELPERS
   ════════════════════════════════════════════════════════════════════════ */

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{
      display: 'inline-flex',
      gap: 4,
      padding: 4,
      background: T.bg.surface2,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
    }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              padding: '8px 16px',
              background: isActive ? T.bg.surface : 'transparent',
              border: 0,
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              fontFamily: T.font.ui,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? T.text.primary : T.text.subtle,
              boxShadow: isActive ? T.shadow.card : 'none',
              transition: 'all 120ms',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterBar({ children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 12,
      marginBottom: 16,
      flexWrap: 'wrap',
    }}>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={fieldLabel}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldInput}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={fieldLabel}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...fieldInput, minWidth: 240 }}
      />
    </div>
  );
}

function Total({ count, loading }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 'auto' }}>
      <span style={fieldLabel}>Gefunden</span>
      <span style={{
        fontFamily: T.font.mono,
        fontSize: 14,
        fontWeight: 600,
        color: T.text.primary,
        padding: '6px 0',
      }}>
        {loading ? '…' : (count ?? 0)}
      </span>
    </div>
  );
}

function DataTable({ columns, items, loading, empty, flat }) {
  if (loading && !items) return <PadCenter>Lade…</PadCenter>;
  if (!items || items.length === 0) {
    return <PadCenter>{empty}</PadCenter>;
  }
  return (
    <div style={{
      border: flat ? 'none' : `1px solid ${T.border.primary}`,
      borderRadius: flat ? 0 : T.radius.md,
      background: T.bg.surface,
      overflowX: 'auto',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font.ui }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align || 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.text.subtle,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '12px 14px',
                  borderBottom: `1px solid ${T.border.primary}`,
                  width: c.w,
                  whiteSpace: 'nowrap',
                  background: T.bg.surface2,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr
              key={r.id || i}
              style={{
                borderBottom: i < items.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
              }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    fontFamily: c.mono ? T.font.mono : T.font.ui,
                    color: T.text.primary,
                    textAlign: c.align || 'left',
                    fontVariantNumeric: c.mono ? 'tabular-nums' : 'normal',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: c.w,
                  }}
                >
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    queued:      { tone: 'accent',  label: 'Queue' },
    in_progress: { tone: 'warn',    label: 'Aktiv' },
    completed:   { tone: 'success', label: 'Fertig' },
    error:       { tone: 'danger',  label: 'Fehler' },
  };
  const m = map[status] || { tone: 'subtle', label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function RoleBadge({ role }) {
  return role === 'admin'
    ? <Badge tone="accent">Admin</Badge>
    : <Badge tone="subtle">Mitarbeiter</Badge>;
}

function ActionBadge({ action }) {
  const tone = {
    upload: 'subtle', start: 'accent', complete: 'success',
    cancel: 'warn', delete: 'danger', history_delete: 'danger',
    user_role_change: 'warn',
  }[action] || 'subtle';
  return <Badge tone={tone}>{action}</Badge>;
}

function PadCenter({ children }) {
  return (
    <div style={{
      padding: '48px 32px',
      textAlign: 'center',
      color: T.text.subtle,
      fontSize: 13,
    }}>
      {children}
    </div>
  );
}

function Forbidden() {
  return (
    <main style={{ padding: 80, textAlign: 'center' }}>
      <h1 style={{ color: T.status.danger.text, fontSize: 24, marginBottom: 8 }}>
        Kein Zugriff
      </h1>
      <p style={{ color: T.text.subtle }}>
        Du brauchst Admin-Rechte für diese Seite.
      </p>
    </main>
  );
}

/* ─── Formatters ─────────────────────────────────────── */

function formatDateTime(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function formatDuration(sec) {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* ─── Inline styles ──────────────────────────────────── */
const fieldLabel = {
  fontSize: 11,
  fontWeight: 500,
  color: T.text.subtle,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const fieldInput = {
  padding: '6px 10px',
  border: `1px solid ${T.border.strong}`,
  borderRadius: T.radius.sm,
  fontSize: 13,
  fontFamily: T.font.ui,
  background: T.bg.surface,
  color: T.text.primary,
  outline: 'none',
};

const smallBtn = {
  padding: '4px 10px',
  background: T.bg.surface2,
  border: `1px solid ${T.border.strong}`,
  borderRadius: T.radius.sm,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: T.font.ui,
  color: T.text.primary,
};
