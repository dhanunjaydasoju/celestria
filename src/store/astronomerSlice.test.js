import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import { ApiError } from '../contracts/api.js'
import { buildHistory, createAstronomerSlice, turnText } from './astronomerSlice.js'

const ANSWER = { status: 'answered', sections: [{ title: 'Size', claims: [{ text: 'Testa b has a radius of 1.1 R⊕.', basis: 'measured', refs: [] }] }], links: [], sources: [] }

/** A store with a controllable fake ask(). */
function setup() {
  const calls = []
  const saved = []
  const ask = (request, opts) =>
    new Promise((resolve, reject) => {
      calls.push({ request, opts, resolve, reject })
      opts.signal.addEventListener('abort', () => reject(new ApiError('CANCELLED', 'Question cancelled.')))
    })
  const store = { load: () => [], save: (t) => saved.push(t), clear: () => saved.push('cleared') }
  const useStore = create((set, get) => createAstronomerSlice(set, get, { ask, store }))
  return { useStore, calls, saved, s: () => useStore.getState() }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('astronomer slice', () => {
  it('sends the question with page context and records server progress and the result', async () => {
    const { s, calls } = setup()
    expect(s().sendQuestion('  How big is Testa b?  ', { planetId: 'testa-b', label: 'Profile · Testa b' })).toBe(true)
    expect(calls[0].request).toEqual({ question: 'How big is Testa b?', planetId: 'testa-b', history: [] })
    expect(s().astronomerTurns[0]).toMatchObject({ status: 'pending', events: [], contextLabel: 'Profile · Testa b' })

    calls[0].opts.onProgress({ stage: 'admitted' })
    calls[0].opts.onProgress({ stage: 'model', model: 'Qwen/Qwen3-32B' })
    expect(s().astronomerTurns[0].events.map((e) => e.stage)).toEqual(['admitted', 'model'])

    calls[0].resolve(ANSWER)
    await tick()
    expect(s().astronomerTurns[0]).toMatchObject({ status: 'done', result: ANSWER })
  })

  it('runs one question at a time and ignores empty questions', () => {
    const { s, calls } = setup()
    expect(s().sendQuestion('   ')).toBe(false)
    s().sendQuestion('first')
    expect(s().sendQuestion('second')).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('sends only validated results back as history', async () => {
    const { s, calls } = setup()
    s().sendQuestion('first')
    calls[0].resolve(ANSWER)
    await tick()
    s().sendQuestion('second')
    calls[1].reject(new ApiError('TIMEOUT', 'No answer arrived in time.'))
    await tick()
    s().sendQuestion('third')
    expect(calls[2].request.history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'Testa b has a radius of 1.1 R⊕.' },
    ])
  })

  it('keeps errors with their retry information, and retry re-asks with the same context', async () => {
    const { s, calls } = setup()
    s().sendQuestion('q', { host: 'Testa' })
    calls[0].reject(Object.assign(new ApiError('RATE_LIMITED', 'Too many'), { retryAfterS: 12 }))
    await tick()
    const failed = s().astronomerTurns[0]
    expect(failed.error).toMatchObject({ code: 'RATE_LIMITED', retryAfterS: 12 })
    s().retryQuestion(failed.id)
    expect(s().astronomerTurns).toHaveLength(1)
    expect(calls[1].request).toMatchObject({ question: 'q', host: 'Testa' })
  })

  it('cancels a running question and clears the conversation', async () => {
    const { s, saved } = setup()
    s().sendQuestion('q')
    s().cancelQuestion()
    await tick()
    expect(s().astronomerTurns[0].error.code).toBe('CANCELLED')
    s().clearConversation()
    expect(s().astronomerTurns).toEqual([])
    expect(saved.at(-1)).toBe('cleared')
  })

  it('never persists pending turns', async () => {
    const { s, saved, calls } = setup()
    s().sendQuestion('q')
    calls[0].opts.onProgress({ stage: 'admitted' })
    expect(saved.at(-1)).toBeDefined()
    calls[0].resolve(ANSWER)
    await tick()
    expect(saved.at(-1)[0].status).toBe('done')
  })
})

describe('history helpers', () => {
  it('uses validated claims or the fixed server message', () => {
    expect(turnText(ANSWER)).toBe('Testa b has a radius of 1.1 R⊕.')
    expect(turnText({ status: 'unverified', message: "I couldn't verify my answer" })).toBe("I couldn't verify my answer")
    const turns = Array.from({ length: 6 }, (_, i) => ({ status: 'done', question: `q${i}`, result: ANSWER }))
    expect(buildHistory(turns, 2).map((m) => m.content)).toEqual(['q4', turnText(ANSWER), 'q5', turnText(ANSWER)])
  })
})
