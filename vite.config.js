/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5176,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Don't accidentally start the backend probe / Clerk / etc. — these
    // are pure-function tests, no React tree needed for now.
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**/*.{js,ts}', 'src/hooks/**/*.{js,ts}', 'src/state.{ts,tsx}'],
      // marathonApi.ts is a thin fetch wrapper covered indirectly by
      // backend pytest. Components have separate UI/integration test
      // strategy (Tier 2.x).
      exclude: [
        'src/marathonApi.ts',
        'src/main.tsx',
        'src/App.tsx',
        'src/index.css',
        'src/components/**',
        'src/screens/**',
        'src/types/**',
      ],
    },
  },
})
