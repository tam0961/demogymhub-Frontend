import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'dev'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3002,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8082', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: false },
})
