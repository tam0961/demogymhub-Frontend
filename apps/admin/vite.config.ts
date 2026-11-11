import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8082', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: false },
})
