/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // Don't accidentally start the backend probe / Clerk / etc. — these
    // are pure-function tests, no React tree needed for now.
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**/*.js', 'src/hooks/**/*.js'],
      // _archive/ holds legacy 433KB files we deliberately don't test;
      // marathonApi.js is a thin fetch wrapper covered indirectly by
      // backend pytest. Components have separate UI/integration test
      // strategy (Tier 2.x).
      exclude: [
        'src/_archive/**',
        'src/marathonApi.js',
        'src/main.jsx',
        'src/App.jsx',
        'src/state.jsx',
        'src/index.css',
        'src/components/**',
        'src/screens/**',
      ],
    },
  },
})