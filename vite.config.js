import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_PORT = process.env.API_PORT || 8787

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // PORT (if set by a launcher) belongs to the web server; the API uses API_PORT.
    port: Number(process.env.PORT) || 5173,
    // Browser → Vite (5173) → Express (8787). Keeps the app same-origin in dev.
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
  test: {
    include: ['src/**/*.test.js', 'server/**/*.test.js'],
    environment: 'node',
  },
})
