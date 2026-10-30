// Global app state — owner: LEAD. Slices follow CLAUDE.md §11.2.
// Components select narrowly: useCelestria((s) => s.selectedPlanetId).
// 3D viewports never read this store; pages pass values in as props.

import { create } from 'zustand'
import { getCatalog } from '../services/api.js'

const MAX_COMPARE = 4

/** @typedef {import('../contracts/planet.js').Planet} Planet */

/** @param {Planet[]} planets */
function indexCatalog(planets) {
  /** @type {Record<string, Planet>} */
  const byId = {}
  /** @type {Record<string, string[]>} host name → planet ids */
  const hosts = {}
  for (const p of planets) {
    byId[p.id] = p
    ;(hosts[p.host] ??= []).push(p.id)
  }
  return { byId, hosts }
}

let inflight = null

export const useCelestria = create((set, get) => ({
  // ── catalog ───────────────────────────────────────────────────────────────
  catalogStatus: /** @type {'idle'|'loading'|'ready'|'error'} */ ('idle'),
  catalogSource: null,
  catalogGeneratedAt: null,
  planets: /** @type {Planet[]} */ ([]),
  byId: {},
  hosts: {},
  catalogError: null,

  /** Loads once per session; concurrent callers share one request. */
  loadCatalog() {
    if (get().catalogStatus === 'ready') return Promise.resolve()
    if (inflight) return inflight
    set({ catalogStatus: 'loading', catalogError: null })
    inflight = getCatalog()
      .then((res) => {
        set({
          catalogStatus: 'ready',
          catalogSource: res.source,
          catalogGeneratedAt: res.generatedAt,
          planets: res.planets,
          ...indexCatalog(res.planets),
        })
      })
      .catch((err) => set({ catalogStatus: 'error', catalogError: err }))
      .finally(() => {
        inflight = null
      })
    return inflight
  },

  // ── selection ─────────────────────────────────────────────────────────────
  selectedPlanetId: null,
  selectedHost: null,
  selectPlanet(id) {
    const host = id ? get().byId[id]?.host ?? null : null
    set(host ? { selectedPlanetId: id, selectedHost: host } : { selectedPlanetId: id })
  },
  selectHost(name) {
    set({ selectedHost: name, selectedPlanetId: null })
  },

  // ── compare ───────────────────────────────────────────────────────────────
  compareIds: /** @type {string[]} */ ([]),
  addCompare(id) {
    const ids = get().compareIds
    if (ids.includes(id) || ids.length >= MAX_COMPARE) return
    set({ compareIds: [...ids, id] })
  },
  removeCompare(id) {
    set({ compareIds: get().compareIds.filter((x) => x !== id) })
  },
  clearCompare() {
    set({ compareIds: [] })
  },

  // ── settings ──────────────────────────────────────────────────────────────
  paused: false,
  timeScale: 1,
  reducedMotion:
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  setPaused(paused) {
    set({ paused })
  },
  setTimeScale(timeScale) {
    set({ timeScale })
  },
}))

export { MAX_COMPARE }
