// CELESTRIA API server — owner: DATA (D3.2; LEAD in M4).
//
// Serves the NASA catalogue: the newest valid of the runtime sync, its backup
// and the committed seed snapshot. A background service re-syncs with NASA
// every 24 h (NASA_SYNC=off disables it). With --production (npm start) it
// also serves the built frontend from dist/, so production runs as one Node
// service.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadAiConfig } from './ai/config.js'
import { createFeatherlessClient } from './ai/featherless.js'
import { createLimiter } from './ai/limits.js'
import { createAstronomer } from './ai/orchestrator.js'
import { createToolContext } from './ai/tools/index.js'
import { createApp } from './app.js'
import { createCatalogStorage } from './nasa/catalogStorage.js'
import { createCatalogStore } from './nasa/catalogStore.js'
import { createSyncService } from './nasa/syncService.js'
import { MIN_TOKEN_LENGTH } from './routes/sync.js'

const PRODUCTION = process.argv.includes('--production')
// Hosts (Render, Railway…) assign PORT in production. In dev the API uses its
// own API_PORT so it never collides with a PORT meant for the Vite server.
const PORT = Number(PRODUCTION ? process.env.PORT : process.env.API_PORT) || 8787
const HERE = path.dirname(fileURLToPath(import.meta.url))
// NASA_REFRESH is the M4 name of the switch; NASA_SYNC wins when both are set.
const syncEnabled = (process.env.NASA_SYNC ?? process.env.NASA_REFRESH ?? 'on') !== 'off'

// The committed snapshot is a read-only seed; syncs go to a git-ignored folder.
const storage = createCatalogStorage({
  seedPath: path.join(HERE, 'data/catalog.snapshot.json.gz'),
  runtimeDir: process.env.NASA_DATA_DIR ? path.resolve(process.env.NASA_DATA_DIR) : path.join(HERE, 'data/runtime'),
  log: console.log,
})
const store = createCatalogStore({ storage, log: console.log })
await store.load()
const sync = createSyncService({ store, storage, log: (m) => console.log(`[sync] ${m}`) })
if (syncEnabled) await sync.start()
else console.log('[sync] NASA sync disabled (NASA_SYNC=off); serving the stored catalogue')
const adminToken = process.env.SYNC_ADMIN_TOKEN || null
if (adminToken && adminToken.length < MIN_TOKEN_LENGTH) console.log(`[sync] SYNC_ADMIN_TOKEN ignored: use at least ${MIN_TOKEN_LENGTH} characters`)

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
  sync: { sync: syncEnabled ? sync : null, adminToken },
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === 'true' : false,
})
app.listen(PORT, () => {
  console.log(`CELESTRIA API listening on http://localhost:${PORT}`)
})
