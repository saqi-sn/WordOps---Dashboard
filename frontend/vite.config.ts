import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev proxy target: the WordOps server running the PHP API.
// Set VITE_API_PROXY in .env.local (e.g. http://203.0.113.10) for local dev.
// In production the SPA and /api are served from the same origin (no proxy needed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY || 'http://localhost:8080'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  }
})
