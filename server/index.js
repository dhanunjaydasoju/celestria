// CELESTRIA API server — owner: DATA (D3.2; LEAD in M4).
//
// Serves the NASA catalogue from the committed snapshot. With --production
// (npm start) it also serves the built frontend from dist/, so production
// runs as one Node service. Set NASA_REFRESH=on to refresh a stale snapshot
// from NASA in the background (default: on in production, off in dev).

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createApp } from './app.js'
import { createCatalogStore } from './nasa/catalogStore.js'

const PRODUCTION = process.argv.includes('--production')
// Hosts (Render, Railway…) assign PORT in production. In dev the API uses its
// own API_PORT so it never collides with a PORT meant for the Vite server.
const PORT = Number(PRODUCTION ? process.env.PORT : process.env.API_PORT) || 8787
const HERE = path.dirname(fileURLToPath(import.meta.url))
const refresh = (process.env.NASA_REFRESH ?? (PRODUCTION ? 'on' : 'off')) === 'on'

const store = createCatalogStore({
  snapshotPath: path.join(HERE, 'data/catalog.snapshot.json.gz'),
  refresh,
  log: console.log,
})
await store.load()

const app = createApp({ store, distDir: PRODUCTION ? path.resolve(HERE, '../dist') : null })
app.listen(PORT, () => {
  console.log(`CELESTRIA API listening on http://localhost:${PORT}`)
})
