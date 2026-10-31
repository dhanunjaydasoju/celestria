// Usage limits for the AI astronomer — owner: AI (LEAD in M5 Phase 2).
//
// Enforced on the server, in memory:
//   • per client: requests per minute and per UTC day
//   • whole server: questions sent to the model per UTC day, and dollars
//     spent per UTC day
//   • concurrency: questions in flight, with a bounded wait queue
//
// Race safety: every check-and-reserve step is synchronous (no await between
// the check and the update), so in Node's single thread two concurrent
// requests can never both pass a check that only one of them fits. Spending
// is reserved before each model call and settled with the provider-reported
// cost afterwards; without a reported cost the full reserve is kept.
// Counters reset on restart (documented limitation).

const MINUTE = 60_000
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)

export class LimitError extends Error {
  /** @param {'RATE_LIMITED'|'DAILY_LIMIT'|'BUDGET_EXHAUSTED'|'SPEND_EXHAUSTED'|'BUSY'} code */
  constructor(code, message, { status, retryAfterS } = {}) {
    super(message)
    this.name = 'LimitError'
    this.code = code
    this.status = status
    this.retryAfterS = retryAfterS ?? null
  }
}

/**
 * @param {Record<string, number>} limits  config.limits
 * @param {{ now?: () => number }} [opts]
 */
export function createLimiter(limits, { now = Date.now } = {}) {
  const clients = new Map() // key → { minute: number[], day, dayCount }
  let day = dayKey(now())
  let questionsToday = 0
  let spentToday = 0
  let reserved = 0
  let active = 0
  const queue = [] // { grant, reject, timer }

  const rollDay = () => {
    const d = dayKey(now())
    if (d !== day) {
      day = d
      questionsToday = 0
      spentToday = 0
    }
  }
  const secondsToMidnight = () => {
    const t = now()
    const d = new Date(t)
    return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t) / 1000))
  }

  /** Per-client rate limits; counts every request, cached or not. Synchronous. */
  function checkClient(key) {
    rollDay()
    const t = now()
    let c = clients.get(key)
    if (!c || c.day !== day) c = { minute: [], day, dayCount: c?.day === day ? c.dayCount : 0 }
    c.minute = c.minute.filter((ts) => t - ts < MINUTE)
    if (c.dayCount >= limits.AI_RATE_LIMIT_PER_DAY) {
      throw new LimitError('DAILY_LIMIT', 'Daily question limit reached for this device. Try again tomorrow.', { status: 429, retryAfterS: secondsToMidnight() })
    }
    if (c.minute.length >= limits.AI_RATE_LIMIT_PER_MINUTE) {
      throw new LimitError('RATE_LIMITED', 'Too many questions in a short time. Please wait a moment.', { status: 429, retryAfterS: Math.max(1, Math.ceil((MINUTE - (t - c.minute[0])) / 1000)) })
    }
    c.minute.push(t)
    c.dayCount++
    clients.set(key, c)
    if (clients.size > 10_000) {
      // Bound memory: drop clients idle for a minute or from earlier days.
      for (const [k, v] of clients) if (v.day !== day || !v.minute.some((ts) => t - ts < MINUTE)) clients.delete(k)
    }
  }

  const canSpend = () => spentToday + reserved + limits.AI_COST_RESERVE_PER_CALL_USD <= limits.AI_DAILY_SPEND_LIMIT_USD + 1e-12

  /**
   * Admit a question that will call the model: global budget, spend headroom
   * and a concurrency slot. Resolves with a ticket; the caller must release().
   * @param {AbortSignal} [signal]
   */
  function admit(signal) {
    rollDay()
    if (questionsToday >= limits.AI_DAILY_REQUEST_BUDGET) {
      return Promise.reject(new LimitError('BUDGET_EXHAUSTED', 'The AI astronomer has reached its daily question budget. It will be back tomorrow.', { status: 503, retryAfterS: secondsToMidnight() }))
    }
    if (!canSpend()) {
      return Promise.reject(new LimitError('SPEND_EXHAUSTED', 'The AI astronomer has reached its daily spending limit. It will be back tomorrow.', { status: 503, retryAfterS: secondsToMidnight() }))
    }
    if (active < limits.AI_MAX_CONCURRENCY) {
      active++
      questionsToday++
      return Promise.resolve(ticket())
    }
    if (queue.length >= limits.AI_MAX_QUEUE) {
      return Promise.reject(new LimitError('BUSY', 'The AI astronomer is busy. Please try again in a few seconds.', { status: 503, retryAfterS: 5 }))
    }
    return new Promise((resolve, reject) => {
      const entry = {}
      const leave = (err) => {
        clearTimeout(entry.timer)
        signal?.removeEventListener('abort', entry.onAbort)
        const i = queue.indexOf(entry)
        if (i >= 0) queue.splice(i, 1)
        reject(err)
      }
      entry.grant = () => {
        clearTimeout(entry.timer)
        signal?.removeEventListener('abort', entry.onAbort)
        // Budgets may have run out while waiting.
        rollDay()
        if (questionsToday >= limits.AI_DAILY_REQUEST_BUDGET || !canSpend()) {
          active--
          reject(new LimitError('BUDGET_EXHAUSTED', 'The AI astronomer has reached its daily budget. It will be back tomorrow.', { status: 503, retryAfterS: secondsToMidnight() }))
          drain()
          return
        }
        questionsToday++
        resolve(ticket())
      }
      entry.timer = setTimeout(() => leave(new LimitError('BUSY', 'The AI astronomer is busy. Please try again in a few seconds.', { status: 503, retryAfterS: 5 })), limits.AI_QUEUE_TIMEOUT_MS)
      entry.onAbort = () => leave(new LimitError('BUSY', 'Request cancelled while waiting.', { status: 503 }))
      signal?.addEventListener('abort', entry.onAbort, { once: true })
      queue.push(entry)
    })
  }

  function drain() {
    while (active < limits.AI_MAX_CONCURRENCY && queue.length) {
      active++
      queue.shift().grant()
    }
  }

  function ticket() {
    let released = false
    let held = 0 // reserve held for the current call
    return {
      /** Reserve spend for one model call. Synchronous; throws when the daily limit would be exceeded. */
      reserveCall() {
        rollDay()
        if (held) throw new Error('reserveCall() called twice without settleCall()')
        if (!canSpend()) throw new LimitError('SPEND_EXHAUSTED', 'The AI astronomer has reached its daily spending limit.', { status: 503, retryAfterS: secondsToMidnight() })
        held = limits.AI_COST_RESERVE_PER_CALL_USD
        reserved += held
      },
      /** Replace the reserve with the real cost (null → keep the reserve as the cost). */
      settleCall(costUsd) {
        if (!held) return 0
        reserved -= held
        const cost = Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : held
        held = 0
        spentToday += cost
        return cost
      },
      release() {
        if (released) return
        released = true
        if (held) this.settleCall(null)
        active--
        drain()
      },
    }
  }

  return {
    checkClient,
    admit,
    /** Snapshot for tests and the status endpoint. */
    state: () => ({ day, questionsToday, spentToday, reserved, active, queued: queue.length }),
  }
}
