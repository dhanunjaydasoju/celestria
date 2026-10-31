// NASA catalogue synchronisation — owner: DATA (implemented by LEAD in M5 Phase A).
//
//   schedule ─┐
//   check  ───┼─► one sync at a time ─► fetch ─► raw checks ─► normalise ─►
//   admin  ───┘   (single flight)        processed checks ─► unchanged? ─► done
//                                                            changed ─► promote
//                                                            (temp, read back,
//                                                            rotate backup) ─► serve
//
// The served catalogue changes only after every check passed and the new
// files are safely on disk. NASA being down, slow or wrong never interrupts
// serving: the store keeps the last valid catalogue. Successful and
// attempted syncs are tracked separately and persisted across restarts.

import { buildCandidate } from './refresh.js'
import { diffCatalogs, fingerprint } from './validateProcessed.js'

export const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR

export const DEFAULTS = {
  intervalMs: DAY, //            sync once a day
  tickMs: HOUR, //               how often the scheduler looks at the clock
  startupDelayMs: 30_000, //     first scheduled check after boot (never blocks start-up)
  backoffMs: [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR], // after consecutive failures
  checkCooldownMs: 15 * 60_000, // anonymous "check for updates": at most one NASA sync per window
  adminCooldownMs: 60_000, //     admin refresh: guard against double clicks / loops
}

/**
 * @param {{
 *   store: ReturnType<typeof import('./catalogStore.js').createCatalogStore>,
 *   storage: ReturnType<typeof import('./catalogStorage.js').createCatalogStorage>,
 *   buildCandidateImpl?: typeof buildCandidate,
 *   now?: () => number,
 *   log?: (m: string) => void,
 *   options?: Partial<typeof DEFAULTS>,
 * }} deps
 */
export function createSyncService({ store, storage, buildCandidateImpl = buildCandidate, now = Date.now, log = () => {}, options = {} }) {
  const opt = { ...DEFAULTS, ...options }
  const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())

  // Persisted history. Times are ISO strings so the file stays readable.
  let history = {
    lastAttemptAt: null, //  any sync attempt finished (success or not)
    lastAttemptResult: null, // 'updated' | 'unchanged' | 'failed' | 'rejected'
    lastAttemptTrigger: null,
    lastSuccessAt: null, //  last attempt that completed with a valid NASA catalogue
    lastChangeAt: null, //   last time NASA data actually changed what we serve
    lastChanges: null, //    { added, removed, updated, examples }
    lastError: null, //      { at, stage, message } — most recent failure, kept until a success
    consecutiveFailures: 0,
  }
  let running = null // the in-flight sync promise (single flight)
  let runningInfo = null
  let timer = null
  let startupTimer = null
  let started = false

  const nextScheduledMs = () => {
    const base = Date.parse(history.lastAttemptAt ?? '') || null
    if (history.consecutiveFailures > 0 && base) {
      return base + opt.backoffMs[Math.min(history.consecutiveFailures - 1, opt.backoffMs.length - 1)]
    }
    const success = Date.parse(history.lastSuccessAt ?? '') || null
    const dataAt = Date.parse(store.get()?.meta.retrievedAt ?? '') || 0
    return Math.max(success ?? 0, dataAt) + opt.intervalMs
  }

  const save = () => storage.writeStatus(history).catch((err) => log(`Could not save sync status: ${err.message}`))

  async function syncOnce(trigger) {
    const startedAt = now()
    const current = store.get()
    const finish = async (result, extra = {}) => {
      const at = iso(now())
      // A successful attempt carries one timestamp for both fields.
      const success = result === 'updated' || result === 'unchanged' ? { lastSuccessAt: at, lastError: null, consecutiveFailures: 0 } : {}
      history = { ...history, lastAttemptAt: at, lastAttemptResult: result, lastAttemptTrigger: trigger, ...extra, ...success, ...(result === 'updated' ? { lastChangeAt: at } : {}) }
      await save()
      return { result, ...extra, durationMs: now() - startedAt }
    }
    log(`NASA sync started (${trigger})`)
    const candidate = await buildCandidateImpl({ previous: current?.planets ?? null, log })
    if (!candidate.ok) {
      const error = { at: iso(now()), stage: candidate.stage, message: candidate.errors.slice(0, 4).join('; ') }
      log(`NASA sync ${candidate.stage === 'fetch' ? 'failed' : 'rejected'} at ${candidate.stage}: ${error.message}. Still serving ${current?.planets.length ?? 0} planets from ${current?.meta.retrievedAt}.`)
      return finish(candidate.stage === 'fetch' ? 'failed' : 'rejected', { lastError: error, consecutiveFailures: history.consecutiveFailures + 1 })
    }

    if (current && fingerprint(candidate.dataset.planets) === fingerprint(current.planets)) {
      log(`NASA sync: no changes (${current.planets.length} planets)`)
      return finish('unchanged', { lastChanges: { added: 0, removed: 0, updated: 0, examples: { added: [], removed: [], updated: [] } } })
    }

    const changes = diffCatalogs(current?.planets ?? [], candidate.dataset.planets)
    try {
      await storage.promote(candidate.dataset)
    } catch (err) {
      const error = { at: iso(now()), stage: 'store', message: err.message }
      log(`NASA sync could not save the new catalogue (${err.message}); still serving the previous one.`)
      return finish('failed', { lastError: error, consecutiveFailures: history.consecutiveFailures + 1 })
    }
    store.replace(candidate.dataset)
    log(`NASA sync: catalogue updated (${candidate.dataset.planets.length} planets; +${changes.added} −${changes.removed} ~${changes.updated})`)
    return finish('updated', { lastChanges: changes })
  }

  /**
   * Start a sync unless one is running (then join it). Never throws.
   * @param {'scheduled'|'check'|'admin'|'startup'} trigger
   */
  function run(trigger) {
    if (running) return { started: false, promise: running }
    runningInfo = { trigger, startedAt: iso(now()) }
    running = syncOnce(trigger)
      .catch(async (err) => {
        history = { ...history, lastAttemptAt: iso(now()), lastAttemptResult: 'failed', lastAttemptTrigger: trigger, lastError: { at: iso(now()), stage: 'internal', message: err.message }, consecutiveFailures: history.consecutiveFailures + 1 }
        await save()
        return { result: 'failed' }
      })
      .finally(() => {
        running = null
        runningInfo = null
      })
    return { started: true, promise: running }
  }

  /** Scheduler step: sync when due. Safe to call at any time. */
  function tick() {
    if (!running && now() >= nextScheduledMs()) return run('scheduled')
    return { started: false, promise: running }
  }

  /**
   * Anonymous "check for updates": allowed only when no sync has been
   * attempted within the cooldown window (whoever asked).
   * @returns {{ accepted: boolean, reason?: string, retryAfterS?: number, promise?: Promise }}
   */
  function requestCheck() {
    if (running) return { accepted: true, reason: 'already_running', promise: running }
    const last = Date.parse(history.lastAttemptAt ?? '') || 0
    const wait = last + opt.checkCooldownMs - now()
    if (wait > 0) return { accepted: false, reason: 'cooldown', retryAfterS: Math.ceil(wait / 1000) }
    const r = run('check')
    return { accepted: true, reason: 'started', promise: r.promise }
  }

  /** Admin refresh (token checked by the route): short cooldown only. */
  function requestAdminRefresh() {
    if (running) return { accepted: true, reason: 'already_running', promise: running }
    const last = Date.parse(history.lastAttemptAt ?? '') || 0
    const wait = last + opt.adminCooldownMs - now()
    if (wait > 0) return { accepted: false, reason: 'cooldown', retryAfterS: Math.ceil(wait / 1000) }
    const r = run('admin')
    return { accepted: true, reason: 'started', promise: r.promise }
  }

  async function start() {
    if (started) return
    started = true
    const saved = await storage.readStatus()
    if (saved && typeof saved === 'object') history = { ...history, ...saved }
    startupTimer = setTimeout(() => tick(), opt.startupDelayMs)
    timer = setInterval(() => tick(), opt.tickMs)
    startupTimer.unref?.()
    timer.unref?.()
    log(`NASA sync scheduled every ${Math.round(opt.intervalMs / HOUR)} h; next ${iso(Math.max(nextScheduledMs(), now() + opt.startupDelayMs))}`)
  }

  function stop() {
    clearTimeout(startupTimer)
    clearInterval(timer)
    started = false
  }

  /** Public status (no secrets, no internals). */
  function status() {
    const s = store.get()
    const checkWait = (Date.parse(history.lastAttemptAt ?? '') || 0) + opt.checkCooldownMs - now()
    return {
      source: 'NASA Exoplanet Archive · Planetary Systems Composite Parameters (pscomppars)',
      catalog: s ? { count: s.planets.length, retrievedAt: s.meta.retrievedAt, origin: s.origin } : null,
      sync: {
        enabled: started,
        running: Boolean(running),
        runningSince: runningInfo?.startedAt ?? null,
        runningTrigger: runningInfo?.trigger ?? null,
        lastSuccessAt: history.lastSuccessAt,
        lastAttemptAt: history.lastAttemptAt,
        lastAttemptResult: history.lastAttemptResult,
        lastChangeAt: history.lastChangeAt,
        lastChanges: history.lastChanges,
        lastError: history.lastError,
        consecutiveFailures: history.consecutiveFailures,
        nextScheduledAt: started ? iso(Math.max(nextScheduledMs(), now())) : null,
        intervalHours: opt.intervalMs / HOUR,
        checkAvailableInS: running ? null : Math.max(0, Math.ceil(checkWait / 1000)),
      },
    }
  }

  return { start, stop, tick, run, requestCheck, requestAdminRefresh, status, get running() { return Boolean(running) } }
}
