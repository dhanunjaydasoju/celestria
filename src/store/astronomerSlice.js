// AI astronomer conversation state — owner: LEAD (store), M5 Phase 3.
// Composed into useCelestria. A conversation lasts for the browser session
// (sessionStorage); only finished turns are kept, and only results the
// server validated are ever stored or sent back as history.

import { askAstronomer } from '../services/api.js'

const STORAGE_KEY = 'celestria.astronomer.v1'
const MAX_TURNS = 30
/** Earlier turns sent with a question (server caps this again). */
export const HISTORY_TURNS = 4

const storage = {
  load() {
    try {
      const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
      const turns = raw ? JSON.parse(raw) : []
      return Array.isArray(turns) ? turns.filter((t) => t && t.status !== 'pending') : []
    } catch {
      return []
    }
  },
  save(turns) {
    try {
      globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(turns.filter((t) => t.status !== 'pending').slice(-MAX_TURNS)))
    } catch {
      /* private mode or quota: the conversation simply isn't kept */
    }
  },
  clear() {
    try {
      globalThis.sessionStorage?.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** What the assistant said, for history: validated claim text or the fixed message. */
export function turnText(result) {
  if (!result) return ''
  if (result.status === 'answered') return result.sections.flatMap((s) => s.claims.map((c) => c.text)).join(' ')
  return result.message ?? ''
}

/** History for the next request: finished turns with a server result, oldest first. */
export function buildHistory(turns, max = HISTORY_TURNS) {
  return turns
    .filter((t) => t.status === 'done' && t.result)
    .slice(-max)
    .flatMap((t) => [
      { role: 'user', content: t.question },
      { role: 'assistant', content: turnText(t.result).slice(0, 1500) },
    ])
}

let controller = null
let nextId = Date.now()

/**
 * @param {Function} set
 * @param {Function} get
 * @param {{ ask?: typeof askAstronomer, store?: typeof storage }} [deps]  injectable for tests
 */
export function createAstronomerSlice(set, get, { ask = askAstronomer, store = storage } = {}) {
  const update = (id, patch) => {
    set((s) => ({ astronomerTurns: s.astronomerTurns.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) }))
    store.save(get().astronomerTurns)
  }

  return {
    astronomerOpen: false,
    astronomerTurns: store.load(),
    /** Shown system and planet on the System View (set by ExplorePage). */
    pageFocus: null,

    setPageFocus(focus) {
      set({ pageFocus: focus })
    },
    openAstronomer() {
      set({ astronomerOpen: true })
    },
    closeAstronomer() {
      set({ astronomerOpen: false })
    },

    /**
     * Ask a question with the page context ({ planetId?, host?, compareIds?, label? }).
     * One question at a time; returns false when one is already running.
     */
    sendQuestion(question, context = {}) {
      const text = String(question ?? '').trim()
      if (!text || get().astronomerTurns.some((t) => t.status === 'pending')) return false
      const id = `t${nextId++}`
      const request = {
        question: text,
        ...(context.planetId ? { planetId: context.planetId } : {}),
        ...(context.host ? { host: context.host } : {}),
        ...(context.compareIds?.length ? { compareIds: context.compareIds } : {}),
        history: buildHistory(get().astronomerTurns),
      }
      const turn = { id, question: text, contextLabel: context.label ?? null, context, request, status: 'pending', events: [], startedAt: Date.now(), result: null, error: null }
      set((s) => ({ astronomerTurns: [...s.astronomerTurns, turn] }))
      controller = new AbortController()
      ask(request, {
        signal: controller.signal,
        // Each event is a stage the server confirmed; nothing is added locally.
        onProgress: (event) => update(id, (t) => ({ events: [...t.events, event] })),
      })
        .then((result) => update(id, { status: 'done', result, finishedAt: Date.now() }))
        .catch((err) =>
          update(id, {
            status: 'error',
            finishedAt: Date.now(),
            error: { code: err?.code ?? 'UNKNOWN', message: err?.message ?? 'Something went wrong.', retryAfterS: err?.retryAfterS ?? null, at: Date.now() },
          }),
        )
        .finally(() => {
          controller = null
        })
      return true
    },

    cancelQuestion() {
      controller?.abort()
    },

    /** Re-ask a failed turn with the same context (replaces it). */
    retryQuestion(id) {
      const turn = get().astronomerTurns.find((t) => t.id === id)
      if (!turn || turn.status === 'pending') return false
      set((s) => ({ astronomerTurns: s.astronomerTurns.filter((t) => t.id !== id) }))
      return get().sendQuestion(turn.question, turn.context)
    },

    clearConversation() {
      controller?.abort()
      set({ astronomerTurns: [] })
      store.clear()
    },
  }
}
