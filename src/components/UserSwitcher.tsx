/* Sidebar footer — Clerk-backed identity + sign-in.

   Signed out → "Anmelden" button opens Clerk's modal sign-in (email
   + verification code, per Clerk app config).
   Signed in  → Clerk <UserButton/> handles avatar + manage + sign-out;
   we render the user's name + role (from our /api/me) next to it. */

import { useQuery } from '@tanstack/react-query';
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { getMe } from '../marathonApi.js';
import { T } from './ui.jsx';

function FooterShell({ children, collapsed }) {
  return (
    <div style={{
      padding: collapsed ? '10px 0' : '10px 12px 12px',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: collapsed ? 'center' : 'stretch',
      gap: 6,
    }}>
      {children}
    </div>
  );
}

export function UserSwitcher({ collapsed = false }) {
  const { user } = useUser();
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!user,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });
  const me = meQ.data;

  return (
    <FooterShell collapsed={collapsed}>
      <SignedOut>
        <SignInButton mode="modal">
          {collapsed ? (
            <button
              title="Anmelden"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                background: 'transparent',
                color: T.text.subtle,
                border: `1px solid ${T.border.primary}`,
                borderRadius: '50%',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 160ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.accent.main;
                e.currentTarget.style.color = T.accent.main;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.border.primary;
                e.currentTarget.style.color = T.text.subtle;
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l3 4-3 4M3 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '6px 10px',
                background: 'transparent',
                color: T.text.secondary,
                border: `1px solid ${T.border.strong}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: T.font.ui,
                fontSize: 12.5,
                fontWeight: 500,
                transition: 'all 160ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.accent.main;
                e.currentTarget.style.color = T.accent.main;
                e.currentTarget.style.background = T.accent.bg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.border.strong;
                e.currentTarget.style.color = T.text.secondary;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l3 4-3 4M3 7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Anmelden
            </button>
          )}
        </SignInButton>
        {!collapsed && (
          <span style={{ fontSize: 10, color: T.text.faint, textAlign: 'center', letterSpacing: '0.04em' }}>
            Email · Magic Link
          </span>
        )}
      </SignedOut>

      <SignedIn>
        {collapsed ? (
          /* Just the avatar — UserButton handles its own dropdown menu. */
          <div title={me?.name || user?.firstName || ''}>
            <UserButton afterSignOutUrl="/" appearance={{
              elements: { avatarBox: { width: 36, height: 36 } },
            }} />
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 4px',
          }}>
            <UserButton afterSignOutUrl="/" appearance={{
              elements: { avatarBox: { width: 32, height: 32 } },
            }} />
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: T.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {me?.name || user?.firstName || user?.username || '…'}
              </div>
              <div style={{
                fontSize: 11,
                color: me?.role === 'admin' ? T.accent.text : T.text.subtle,
                fontWeight: 500,
                marginTop: 1,
              }}>
                {meQ.isLoading
                  ? 'lädt…'
                  : me?.role === 'admin' ? 'Admin' : 'Mitarbeiter'}
              </div>
            </div>
          </div>
        )}
      </SignedIn>
    </FooterShell>
  );
}