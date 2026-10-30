// CELESTRIA API server — owner: DATA (D3.2 extends this).
//
// M0 stub: health check and JSON 404s for unknown /api routes. With
// --production (npm start) it also serves the built frontend from dist/, so
// production runs as one Node service. Route modules (routes/planets.js,
// routes/astronomer.js) mount here as they land.

import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PRODUCTION = process.argv.includes('--production')
// Hosts (Render, Railway…) assign PORT in production. In dev the API uses its
// own API_PORT so it never collides with a PORT meant for the Vite server.
const PORT = Number(PRODUCTION ? process.env.PORT : process.env.API_PORT) || 8787
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_req, res) => {
  // catalog fields become real once the NASA cache exists (D3.3).
  res.json({ ok: true, catalog: { count: 0, generatedAt: null, source: null } })
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } })
})

if (PRODUCTION) {
  if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ not found. Run `npm run build` first.')
  app.use(express.static(DIST, { index: false, maxAge: '1h' }))
  // Client-side routes (e.g. /planet/kepler-22-b) all serve the SPA shell.
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// Last-resort JSON error handler; never leak stack traces to clients.
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: { code: 'UNKNOWN', message: 'Internal server error.' } })
})

app.listen(PORT, () => {
  console.log(`CELESTRIA API listening on http://localhost:${PORT}`)
})
