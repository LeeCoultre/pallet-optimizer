/* Sidebar footer — pick / switch user (Sprint 1 stub for auth).
   Sets X-User-Id in localStorage; replaced by real auth in Sprint 2. */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listUsers, getMe } from '../marathonApi.js';
import { setUserId, getUserId } from '../userId.js';
import { T } from './ui.jsx';

function initials(name = '') {
  const stripped = name.replace(/^Lynne/i, '');
  return (stripped[0] || name[0] || '?').toUpperCase();
}

function Avatar({ name, role, size = 28 }) {
  const isAdmin = role === 'admin';
  return (
    <span style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isAdmin ? T.accent.main : T.bg.surface3,
      color: isAdmin ? '#fff' : T.text.secondary,
      fontSize: size >= 28 ? 12 : 10,
      fontWeight: 600,
      letterSpacing: '0.02em',
    }}>
      {initials(name)}
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform 150ms',
      flexShrink: 0,
    }}>
      <path d="M2 4l3 3 3-3" stroke={T.text.subtle} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function UserRow({ user, onClick, currentId }) {
  const isCurrent = user.id === currentId;
  return (
    <button
      onClick={onClick}
      disabled={isCurrent}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: 'transparent',
        border: 0,
        borderRadius: T.radius.sm,
        cursor: isCurrent ? 'default' : 'pointer',
        textAlign: 'left',
        width: '100%',
        opacity: isCurrent ? 0.5 : 1,
        fontFamily: T.font.ui,
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = T.bg.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Avatar name={user.name} role={user.role} size={22} />
      <span style={{ fontSize: 12.5, fontWeight: 500, color: T.text.primary }}>
        {user.name}
      </span>
    </button>
  );
}

export function UserSwitcher() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const currentId = getUserId();

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    refetchInterval: false,
    staleTime: Infinity,
  });
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!currentId,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });

  const switchTo = (id) => {
    setUserId(id);
    qc.invalidateQueries();
    setOpen(false);
  };

  const users = usersQ.data ?? [];
  const me = meQ.data;

  /* ── No user picked: full picker ─────────────────────────────── */
  if (!currentId || !me) {
    if (usersQ.isLoading) {
      return <FooterShell><span style={loadingStyle}>Lade Benutzer…</span></FooterShell>;
    }
    if (usersQ.isError) {
      return <FooterShell><span style={errorStyle}>Backend nicht erreichbar</span></FooterShell>;
    }
    return (
      <FooterShell>
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          padding: '0 8px 6px',
        }}>
          Wer arbeitet?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {users.map((u) => (
            <UserRow key={u.id} user={u} onClick={() => switchTo(u.id)} />
          ))}
        </div>
      </FooterShell>
    );
  }

  /* ── User picked: identity row, expandable ──────────────────── */
  return (
    <FooterShell>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 8px',
          background: open ? T.bg.surface2 : 'transparent',
          border: 0,
          borderRadius: T.radius.md,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 120ms',
          fontFamily: T.font.ui,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = T.bg.surface2; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <Avatar name={me.name} role={me.role} />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {me.name}
          </div>
          <div style={{
            fontSize: 11,
            color: me.role === 'admin' ? T.accent.text : T.text.subtle,
            fontWeight: 500,
            marginTop: 1,
          }}>
            {me.role === 'admin' ? 'Admin' : 'Mitarbeiter'}
          </div>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div style={{
          marginTop: 4,
          padding: '4px 0',
          borderTop: `1px solid ${T.border.subtle}`,
        }}>
          {users.filter((u) => u.id !== me.id).map((u) => (
            <UserRow key={u.id} user={u} onClick={() => switchTo(u.id)} currentId={me.id} />
          ))}
          <button
            onClick={() => switchTo(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: 'transparent',
              border: 0,
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              marginTop: 2,
              fontFamily: T.font.ui,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.status.danger.bg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M9 4l3 3-3 3M12 7H6" stroke={T.status.danger.main} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span style={{ fontSize: 12.5, color: T.status.danger.text, fontWeight: 500 }}>
              Abmelden
            </span>
          </button>
        </div>
      )}
    </FooterShell>
  );
}

const loadingStyle = { fontSize: 12, color: T.text.subtle, padding: '8px' };
const errorStyle   = { fontSize: 12, color: T.status.danger.text, padding: '8px' };

function FooterShell({ children }) {
  return (
    <div style={{
      padding: '10px 10px 12px',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {children}
    </div>
  );
}
