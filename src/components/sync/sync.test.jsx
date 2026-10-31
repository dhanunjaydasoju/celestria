import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { catalogUpdateAvailable, createSyncSlice } from '../../store/syncSlice.js'
import { useCelestria } from '../../store/useCelestria.js'
import { changesText, formatUtc, relative, syncHealth } from './syncFormat.js'
import { DataFreshness, SyncPanel } from './SyncStatus.jsx'

vi.mock('../../store/useCelestria.js', () => {
  let state = {}
  const useCelestria = (selector) => selector(state)
  useCelestria.setState = (patch) => {
    state = { ...state, ...patch }
  }
  return { useCelestria }
})

const here = path.dirname(fileURLToPath(import.meta.url))
const NOW = Date.parse('2026-10-31T15:00:00Z')
const STATUS = {
  source: 'NASA Exoplanet Archive · Planetary Systems Composite Parameters (pscomppars)',
  catalog: { count: 6454, retrievedAt: '2026-10-31T12:00:00.000Z', origin: 'live' },
  sync: {
    enabled: true,
    running: false,
    lastSuccessAt: '2026-10-31T12:00:00.000Z',
    lastAttemptAt: '2026-10-31T14:00:00.000Z',
    lastAttemptResult: 'failed',
    lastChangeAt: '2026-10-31T12:00:00.000Z',
    lastChanges: { added: 3, removed: 0, updated: 12, examples: { added: ['TOI-9999 b'], removed: [], updated: ['WASP-12 b'] } },
    lastError: { at: '2026-10-31T14:00:00.000Z', stage: 'fetch', message: 'HTTP 525' },
    consecutiveFailures: 1,
    nextScheduledAt: '2026-10-31T15:00:00.000Z',
    intervalHours: 24,
    checkAvailableInS: 0,
  },
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('sync formatting', () => {
  it('formats UTC times, relative times and changes', () => {
    expect(formatUtc('2026-10-31T01:52:37.974Z')).toBe('31 Oct 2026, 01:52 UTC')
    expect(relative('2026-10-31T12:00:00Z', NOW)).toBe('3 h ago')
    expect(relative('2026-11-01T12:00:00Z', NOW)).toBe('in 21 h')
    expect(changesText({ added: 3, removed: 0, updated: 12 })).toBe('3 new · 12 updated')
    expect(changesText({ added: 0, removed: 0, updated: 0 })).toBe('No changes')
    expect(syncHealth(STATUS)).toBe('warn')
    expect(syncHealth({ sync: { enabled: false } })).toBe('off')
  })
})

describe('sync status UI', () => {
  it('distinguishes last success from last attempt and shows count, changes, schedule and error', () => {
    useCelestria.setState({ syncStatus: STATUS, syncCheck: null, checkForUpdates: () => {} })
    const t = text(renderToStaticMarkup(<SyncPanel />))
    expect(t).toContain('Last successful sync 31 Oct 2026, 12:00 UTC')
    expect(t).toContain('Last attempt 31 Oct 2026, 14:00 UTC · Failed · NASA unreachable or incomplete')
    expect(t).toContain('6,454 planets')
    expect(t).toContain('3 new · 12 updated')
    expect(t).toContain('New: TOI-9999 b')
    expect(t).toContain('Next scheduled sync 31 Oct 2026, 15:00 UTC')
    expect(t).toContain('Recent error HTTP 525')
    expect(t).toContain('Check NASA for updates')
  })

  it('disables the check while the server-reported cooldown runs', () => {
    useCelestria.setState({ syncStatus: { ...STATUS, sync: { ...STATUS.sync, checkAvailableInS: 840 } }, syncStatusAt: Date.now(), syncCheck: null })
    const html = renderToStaticMarkup(<SyncPanel />)
    expect(html).toMatch(/class="sync-check" disabled=""/)
    expect(text(html)).toContain('next check available in 14 min')
  })

  it('shows freshness from the last successful sync, flagging a failed attempt', () => {
    useCelestria.setState({ syncStatus: STATUS })
    const t = text(renderToStaticMarkup(<DataFreshness />))
    expect(t).toMatch(/NASA data · synced .* ago · last attempt failed/)
  })

  it('explains the cooldown after a refused check', () => {
    useCelestria.setState({ syncStatus: STATUS, syncStatusAt: Date.now(), syncCheck: { accepted: false, reason: 'cooldown', retryAfterS: 600, at: Date.now() } })
    const html = renderToStaticMarkup(<SyncPanel />)
    expect(text(html)).toContain('next check available in 10 min')
    expect(html).toMatch(/class="sync-check" disabled=""/)
  })
})

describe('sync store slice', () => {
  const make = (status, checkResult) => {
    const scheduled = []
    const useStore = create((set, get) => ({
      catalogGeneratedAt: '2026-10-31T00:00:00Z',
      catalogStatus: 'ready',
      details: { a: 1 },
      detailStatus: { a: 'ready' },
      loads: 0,
      loadCatalog: () => set((s) => ({ loads: s.loads + 1 })),
      ...createSyncSlice(set, get, { fetchStatus: async () => status, check: async () => checkResult, schedule: (fn, ms) => scheduled.push(ms) }),
    }))
    return { s: () => useStore.getState(), scheduled }
  }

  it('notices newer NASA data on the server and reloads it, clearing cached details', async () => {
    const { s, scheduled } = make(STATUS)
    await s().loadSyncStatus()
    expect(catalogUpdateAvailable(s())).toBe(true)
    expect(scheduled.at(-1)).toBe(5 * 60_000)
    s().reloadCatalog()
    expect(s()).toMatchObject({ details: {}, detailStatus: {}, loads: 1 })
  })

  it('polls quickly while a sync runs, and records check outcomes', async () => {
    const running = { ...STATUS, sync: { ...STATUS.sync, running: true } }
    const { s, scheduled } = make(running, { accepted: false, reason: 'cooldown', retryAfterS: 300 })
    await s().loadSyncStatus()
    expect(scheduled.at(-1)).toBe(5000)
    await s().checkForUpdates()
    expect(s().syncCheck).toMatchObject({ reason: 'cooldown', retryAfterS: 300 })
  })
})

describe('no credentials in the frontend', () => {
  it('no source file under src/ mentions the admin token or the refresh endpoint', () => {
    const root = path.resolve(here, '../..')
    const files = []
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(jsx?|json)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) files.push(p)
      }
    }
    walk(root)
    const offenders = files.filter((f) => /SYNC_ADMIN_TOKEN|\/api\/sync\/refresh|Authorization/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => path.relative(root, f))).toEqual([])
  })
})
