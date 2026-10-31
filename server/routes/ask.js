// AI astronomer API — owner: AI (LEAD in M5 Phase 2). Shapes: src/contracts/api.js.
//
//   POST /api/ask         { question, planetId?, host?, compareIds?, history? } → AskResponse
//   GET  /api/ask/status  → { available, model }
//
// With `Accept: application/x-ndjson` the same request streams one JSON
// object per line: { type: 'progress', stage, … } for each stage the server
// actually reaches, then exactly one { type: 'result', result } or
// { type: 'error', error: { code, message, status, retryAfterS } }. Only
// validated results are ever written; model text is never streamed.
//
// The client sends text and ids only; every number in an answer comes from
// the server's own catalogue through the validated tool flow.

import { Router } from 'express'
import { apiError } from '../http/sendJson.js'
import { LimitError } from '../ai/limits.js'
import { AskError } from '../ai/orchestrator.js'

/**
 * @param {{ astronomer: ReturnType<typeof import('../ai/orchestrator.js').createAstronomer> | null, config: { configured: boolean, model: string } }} deps
 */
export function askRouter({ astronomer, config }) {
  const r = Router()

  r.get('/ask/status', (_req, res) => {
    res.json({ available: Boolean(astronomer && config.configured), model: config.configured ? config.model : null })
  })

  r.post('/ask', async (req, res, next) => {
    if (!astronomer || !config.configured) return apiError(res, 503, 'AI_UNAVAILABLE', 'The AI astronomer is not configured on this server.')
    const body = req.body ?? {}
    // Abort model calls if the client goes away before the answer is sent.
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    const request = {
      question: body.question,
      planetId: body.planetId ?? null,
      host: body.host ?? null,
      compareIds: body.compareIds ?? null,
      history: body.history ?? [],
      clientKey: req.ip ?? 'unknown',
      signal: controller.signal,
    }

    if (/application\/x-ndjson/.test(req.get('accept') ?? '')) {
      res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
      res.flushHeaders()
      const write = (obj) => {
        if (!res.writableEnded && !controller.signal.aborted) res.write(`${JSON.stringify(obj)}\n`)
      }
      try {
        const result = await astronomer.ask({ ...request, onProgress: (p) => write({ type: 'progress', ...p }) })
        write({ type: 'result', result })
      } catch (err) {
        const known = err instanceof LimitError || err instanceof AskError
        if (!known) console.error(err)
        write({
          type: 'error',
          error: known
            ? { code: err.code, message: err.message, status: err.status === 499 ? 400 : err.status, retryAfterS: err.retryAfterS ?? null }
            : { code: 'UNKNOWN', message: 'Internal server error.', status: 500, retryAfterS: null },
        })
      }
      return res.end()
    }

    try {
      const answer = await astronomer.ask(request)
      res.set('Cache-Control', 'no-store').json(answer)
    } catch (err) {
      if (res.headersSent || controller.signal.aborted) return
      if (err instanceof LimitError) {
        if (err.retryAfterS) res.set('Retry-After', String(err.retryAfterS))
        return apiError(res, err.status, err.code, err.message)
      }
      if (err instanceof AskError) return apiError(res, err.status === 499 ? 400 : err.status, err.code, err.message)
      next(err)
    }
  })

  return r
}
