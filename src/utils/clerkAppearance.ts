/* Clerk theming — drives the look of every Clerk-rendered surface
   (SignIn modal, UserButton dropdown, manage-profile dialog, etc.)
   from Marathon's design tokens.

   Trick: every value here is a CSS custom property reference. Because
   the variables live on <html> (set by applyTheme / applyAccent), Clerk
   reads the *current* theme automatically — switching dark/light or
   the accent color repaints the Clerk modals without re-mounting the
   provider.

   Spec for `appearance`: https://clerk.com/docs/customization/overview */

/* Clerk's Appearance type lives in @clerk/types, which isn't a direct
   dependency. The shape is structurally checked at the call site
   (ClerkProvider's appearance prop) so we leave this object untyped here. */
export const clerkAppearance = {
  variables: {
    colorPrimary:           'var(--accent)',
    colorBackground:        'var(--bg-surface)',
    colorText:              'var(--text-primary)',
    colorTextSecondary:     'var(--text-subtle)',
    colorTextOnPrimaryBackground: '#FFFFFF',
    colorInputBackground:   'var(--bg-surface)',
    colorInputText:         'var(--text-primary)',
    colorNeutral:           'var(--text-subtle)',
    colorDanger:            'var(--status-danger-main)',
    colorSuccess:           'var(--status-success-main)',
    colorWarning:           'var(--status-warn-main)',
    fontFamily:             'Inter, system-ui, -apple-system, sans-serif',
    borderRadius:           '10px',
  },
  elements: {
    /* Card chrome — match Marathon Card token. */
    card: {
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      boxShadow: 'var(--shadow-modal)',
    },
    rootBox: {
      colorScheme: 'inherit',
    },
    /* Headings inside the modal. */
    headerTitle: {
      color: 'var(--text-primary)',
      letterSpacing: '-0.01em',
    },
    headerSubtitle: {
      color: 'var(--text-subtle)',
    },
    /* Inputs. */
    formFieldInput: {
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      color: 'var(--text-primary)',
    },
    formFieldLabel: {
      color: 'var(--text-secondary)',
      fontWeight: 500,
    },
    /* Primary CTA — uses our accent. */
    formButtonPrimary: {
      backgroundColor: 'var(--accent)',
      color: '#FFFFFF',
      fontWeight: 600,
      textTransform: 'none',
      boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
      '&:hover': {
        backgroundColor: 'var(--accent-hover)',
      },
      '&:focus': {
        boxShadow: '0 0 0 3px var(--accent-bg)',
      },
    },
    /* Secondary / link buttons. */
    footerActionLink: {
      color: 'var(--accent-text)',
      fontWeight: 500,
      '&:hover': { color: 'var(--accent)' },
    },
    identityPreviewEditButton: {
      color: 'var(--accent-text)',
    },
    /* Divider lines. */
    dividerLine: { backgroundColor: 'var(--border-primary)' },
    dividerText: { color: 'var(--text-faint)' },
    /* Social buttons (if Clerk org enables them). */
    socialButtonsBlockButton: {
      border: '1px solid var(--border-primary)',
      backgroundColor: 'var(--bg-surface)',
      color: 'var(--text-primary)',
      '&:hover': { backgroundColor: 'var(--bg-surface-3)' },
    },
    /* UserButton popover (the menu after clicking the avatar). */
    userButtonPopoverCard: {
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      boxShadow: 'var(--shadow-modal)',
    },
    userButtonPopoverActionButton: {
      color: 'var(--text-primary)',
      '&:hover': { backgroundColor: 'var(--bg-surface-3)' },
    },
    userButtonPopoverActionButtonText: { color: 'inherit' },
    userButtonPopoverFooter: {
      borderTop: '1px solid var(--border-primary)',
    },
    /* Modal backdrop — slightly opaque so dark theme reads as a real dim. */
    modalBackdrop: {
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      backdropFilter: 'blur(4px)',
    },
  },
};
