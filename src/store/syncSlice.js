// NASA sync status in the client — owner: LEAD (store), M5 Phase A.
// Polls the server's public status; notices when the server serves newer
// NASA data than this session loaded, and reloads it on request.

import { clearPlanetCache, getSyncStatus, requestSyncCheck } from '../services/api.js'

const POLL_MS = 5 * 60_000
const RUNNING_POLL_MS = 5_000

let timer = null

/**
 * @param {Function} set
 * @param {Function} get
 * @param {{ fetchStatus?: typeof getSyncStatus, check?: typeof requestSyncCheck, schedule?: typeof setTimeout }} [deps]
 */
export function createSyncSlice(set, get, { fetchStatus = getSyncStatus, check = requestSyncCheck, schedule = setTimeout } = {}) {
  return {
    syncStatus: null,
    syncStatusAt: null, // when syncStatus was fetched (for countdowns)
    syncCheck: null, // last check request outcome { accepted, reason, retryAfterS, message, at }

    /** Fetch status now; poll faster while a sync is running. */
    async loadSyncStatus() {
      const status = await fetchStatus().catch(() => null)
      if (status) set({ syncStatus: status, syncStatusAt: Date.now() })
      clearTimeout(timer)
      timer = schedule(() => get().loadSyncStatus(), status?.sync?.running ? RUNNING_POLL_MS : POLL_MS)
      return status
    },

    async checkForUpdates() {
      const out = await check()
      set({ syncCheck: { ...out, at: Date.now() }, ...(out.status ? { syncStatus: out.status, syncStatusAt: Date.now() } : {}) })
      if (out.accepted) get().loadSyncStatus()
      return out
    },

    /** Load the newer catalogue the server now serves. */
    reloadCatalog() {
      clearPlanetCache()
      set({ catalogStatus: 'idle', details: {}, detailStatus: {} })
      return get().loadCatalog()
    },
  }
}

/** True when the server serves a different NASA retrieval than this session loaded. */
export function catalogUpdateAvailable(state) {
  const served = state.syncStatus?.catalog?.retrievedAt
  return Boolean(served && state.catalogGeneratedAt && served !== state.catalogGeneratedAt)
}
