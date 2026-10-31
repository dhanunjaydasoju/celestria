// In-memory catalogue served by the API — owner: DATA (LEAD in M4; M5 Phase A).
// Loads the newest valid catalogue (runtime sync, backup or committed seed)
// at start-up. Synchronisation with NASA lives in syncService.js; a sync
// only reaches this store through replace() after full validation.

import { imputeCatalog } from '../../src/pipeline/imputation.js'
import { readSnapshot } from './snapshot.js'

// Detail-only keys, omitted from the catalogue index to keep it light. Pages
// that display uncertainties or sources (profile, simulator) fetch
// /api/planets/:id, which returns the full record.
const DETAIL_KEYS = new Set(['source', 'err'])

/** Planet without per-value sources and uncertainties (catalogue index payload). */
export function toIndexPlanet(planet) {
  const strip = (node) => {
    if (Array.isArray(node) || node === null || typeof node !== 'object') return node
    const out = {}
    for (const [k, v] of Object.entries(node)) if (!DETAIL_KEYS.has(k)) out[k] = strip(v)
    return out
  }
  return strip(planet)
}

/**
 * In-memory catalogue served by the API.
 * @param {{ storage?: ReturnType<typeof import('./catalogStorage.js').createCatalogStorage>, snapshotPath?: string, log?: (m: string) => void }} opts
 *   storage: seed + runtime files (production); snapshotPath: a single file (tests)
 */
export function createCatalogStore({ storage = null, snapshotPath = null, log = () => {} } = {}) {
  let state = null

  const install = (dataset, origin) => {
    const byId = new Map()
    const byHost = new Map()
    for (const p of dataset.planets) {
      byId.set(p.id, p)
      byHost.set(p.host, [...(byHost.get(p.host) ?? []), p])
    }
    const version = `${dataset.meta.retrievedAt}|${dataset.planets.length}`
    // One object swap: requests in flight keep the state they started with.
    state = {
      meta: dataset.meta,
      origin, // 'seed' | 'runtime' | 'backup' (from disk) or 'live' (synced in this process)
      planets: dataset.planets,
      index: dataset.planets.map(toIndexPlanet),
      byId,
      byHost,
      version,
      // Analysis-only layer (CLAUDE.md §5a); never merged into planets.
      analysis: imputeCatalog(dataset.planets, { catalogVersion: dataset.meta.retrievedAt }),
    }
    return state
  }

  async function load() {
    if (storage) {
      const best = await storage.loadBest()
      install(best.dataset, best.origin)
      log(`Catalogue: ${best.dataset.planets.length} planets from ${best.origin} (${best.dataset.meta.retrievedAt})`)
      return state
    }
    const snap = await readSnapshot(snapshotPath)
    if (!snap) throw new Error(`No catalogue snapshot at ${snapshotPath}. Run npm run data:snapshot.`)
    install(snap, 'seed')
    log(`Catalogue: ${snap.planets.length} planets from snapshot (${snap.meta.retrievedAt})`)
    return state
  }

  return {
    load,
    /** Serve a newly synced, validated catalogue. */
    replace: (dataset) => install(dataset, 'live'),
    get: () => state,
  }
}
