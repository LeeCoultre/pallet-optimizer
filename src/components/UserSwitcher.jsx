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

function FooterShell({ children }) {
  return (
    <div style={{
      padding: '10px 12px 12px',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {children}
    </div>
  );
}

export function UserSwitcher() {
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
    <FooterShell>
      <SignedOut>
        <SignInButton mode="modal">
          <button style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 10px',
            background: T.accent.main,
            color: '#fff',
            border: 0,
            borderRadius: T.radius.md,
            cursor: 'pointer',
            fontFamily: T.font.ui,
            fontSize: 13,
            fontWeight: 600,
            transition: 'background 120ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accent.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.accent.main; }}
          >
            Anmelden
          </button>
        </SignInButton>
        <span style={{ fontSize: 11, color: T.text.faint, textAlign: 'center' }}>
          Email · Magic Link
        </span>
      </SignedOut>

      <SignedIn>
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
      </SignedIn>
    </FooterShell>
  );
}
