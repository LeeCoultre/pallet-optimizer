/* ─────────────────────────────────────────────────────────────────────────
   AppShell — wraps content with the persistent left Sidebar.
   ───────────────────────────────────────────────────────────────────────── */

import { Sidebar, SIDEBAR_WIDTH } from './Sidebar.jsx';

export function AppShell({ route, onRoute, children }) {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg)',
      alignItems: 'stretch',
    }}>
      <Sidebar route={route} onRoute={onRoute} />
      <div style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        marginLeft: 0,    /* sidebar already takes its space */
      }}>
        {children}
      </div>
    </div>
  );
}

export { SIDEBAR_WIDTH };
