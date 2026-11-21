import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Vite serves the React app in development and proxies API calls to the
// Express server (npm run dev:server). In production the Express server
// serves the built `dist/` folder directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Test output and runtime data change during test runs and would otherwise reload the page.
    watch: {
      ignored: ['**/playwright-report/**', '**/test-results/**', '**/screenshots/**', '**/data/**', '**/uploads/**', '**/dist/**'],
    },
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
})
