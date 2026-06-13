import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy /api to the local admin server so the SPA and API share an
// origin (same as production, where nginx proxies /api to the service).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': 'http://localhost:4000' },
  },
})
