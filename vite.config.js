import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT || 8080,
    strictPort: false,
  }
})