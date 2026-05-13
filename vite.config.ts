import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  build: { target: 'esnext' }
})
