// In-memory catalogue served by the API — owner: DATA (LEAD in M4).
// Loads the committed snapshot at start-up; optionally refreshes it from NASA
// in the background when older than maxAgeMs. A failed or invalid refresh
// keeps serving the current data.

import { refreshSnapshot } from './refresh.js'
import { readSnapshot } from './snapshot.js'

const DAY_MS = 24 * 60 * 60 * 1000

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

export function createCatalogStore({ snapshotPath, refresh = false, maxAgeMs = DAY_MS, log = () => {} } = {}) {
  let state = null

  const install = (dataset, origin) => {
    const byId = new Map()
    const byHost = new Map()
    for (const p of dataset.planets) {
      byId.set(p.id, p)
      byHost.set(p.host, [...(byHost.get(p.host) ?? []), p])
    }
    state = {
      meta: dataset.meta,
      origin, // 'snapshot' (from disk) or 'live' (refreshed in this process)
      planets: dataset.planets,
      index: dataset.planets.map(toIndexPlanet),
      byId,
      byHost,
      version: `${dataset.meta.retrievedAt}|${dataset.planets.length}`,
    }
  }

  async function load() {
    const snap = await readSnapshot(snapshotPath)
    if (!snap) throw new Error(`No catalogue snapshot at ${snapshotPath}. Run npm run data:snapshot.`)
    install(snap, 'snapshot')
    log(`Catalogue: ${snap.planets.length} planets from snapshot (${snap.meta.retrievedAt})`)
    if (refresh && Date.now() - Date.parse(snap.meta.retrievedAt) > maxAgeMs) refreshInBackground()
    return state
  }

  let refreshing = null
  function refreshInBackground() {
    if (refreshing) return refreshing
    log('Catalogue snapshot is stale; refreshing from NASA in the background…')
    refreshing = refreshSnapshot(snapshotPath, { log })
      .then((r) => {
        if (r.replaced) install(r.dataset, 'live')
      })
      .catch((err) => log(`Background refresh failed: ${err.message}`))
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  return {
    load,
    refreshInBackground,
    get: () => state,
  }
}
