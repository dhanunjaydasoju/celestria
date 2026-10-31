// CELESTRIA API server — owner: DATA (D3.2; LEAD in M4).
//
// Serves the NASA catalogue from the committed snapshot. With --production
// (npm start) it also serves the built frontend from dist/, so production
// runs as one Node service. Set NASA_REFRESH=on to refresh a stale snapshot
// from NASA in the background (default: on in production, off in dev).

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadAiConfig } from './ai/config.js'
import { createFeatherlessClient } from './ai/featherless.js'
import { createLimiter } from './ai/limits.js'
import { createAstronomer } from './ai/orchestrator.js'
import { createToolContext } from './ai/tools/index.js'
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

// AI astronomer: server-side only. Tools read the canonical catalogue
// (never the imputation layer); the context is rebuilt when it refreshes.
const aiConfig = loadAiConfig(process.env)
let toolContext = null
const getToolContext = () => {
  const s = store.get()
  if (!s) return null
  if (toolContext?.version !== s.version) toolContext = { version: s.version, ctx: createToolContext(s.planets, { meta: s.meta }) }
  return toolContext
}
const astronomer = aiConfig.configured
  ? createAstronomer({ config: aiConfig, client: createFeatherlessClient(aiConfig), limiter: createLimiter(aiConfig.limits), getToolContext, log: (e) => console.log(`[ai] ${JSON.stringify(e)}`) })
  : null
console.log(`AI astronomer: ${aiConfig.configured ? `enabled (${aiConfig.model}, fallback ${aiConfig.fallbackModel})` : 'disabled (FEATHERLESS_API_KEY not set)'}`)

const app = createApp({
  store,
  distDir: PRODUCTION ? path.resolve(HERE, '../dist') : null,
  ai: { astronomer, config: aiConfig },
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === 'true' : false,
})
app.listen(PORT, () => {
  console.log(`CELESTRIA API listening on http://localhost:${PORT}`)
})
