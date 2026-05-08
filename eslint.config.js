import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'src/types/api.generated.ts',  // auto-generated from OpenAPI; don't lint
  ]),

  /* JS / JSX — pre-TS files (parsers, hooks pre-migration etc.) */
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  /* TS / TSX — typed source. Rules tuned for the current state of the
     codebase: warnings (not errors) for things we know are widespread
     (`any`, ts-nocheck) so the build doesn't block, but they still
     show up as a punch list to chip away at. */
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      /* Use the TS-aware variant; vanilla no-unused-vars trips on
         type-only imports and enums. */
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
      }],

      /* Widespread today (~200 sites). Keep visible as warning while
         we type per-screen helpers properly over time. */
      '@typescript-eslint/no-explicit-any': 'warn',

      /* @ts-nocheck headers come from the migration. Track count so
         it only shrinks. */
      '@typescript-eslint/ban-ts-comment': ['warn', {
        'ts-nocheck': 'allow-with-description',
        minimumDescriptionLength: 5,
      }],

      /* Prefer `import type {...}` over `import {...}` for types —
         strips them at build time, smaller bundles. */
      '@typescript-eslint/consistent-type-imports': ['warn', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      /* `!` non-null assertion is a footgun. Warn — sometimes
         unavoidable (DOM refs after mount), but worth flagging. */
      '@typescript-eslint/no-non-null-assertion': 'warn',

      /* React 19's compiler-aware hook rules surface patterns that
         are technically incorrect (e.g. setState during effect, ref
         access during render) but were fine under the old runtime.
         Downgrade to warn — fixing all sites is a separate refactor.
         New code MUST avoid them. */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      /* react-refresh integration — Vite HMR works either way; the
         "only export components" rule is helpful but currently
         flags many shared-style files (T tokens etc.). Warn. */
      'react-refresh/only-export-components': 'warn',
    },
  },
])
