// AI astronomer API — owner: AI (LEAD in M5 Phase 2). Shapes: src/contracts/api.js.
//
//   POST /api/ask         { question, planetId?, history? } → AskResponse
//   GET  /api/ask/status  → { available, model }
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
    try {
      const answer = await astronomer.ask({
        question: body.question,
        planetId: body.planetId ?? null,
        history: body.history ?? [],
        clientKey: req.ip ?? 'unknown',
        signal: controller.signal,
      })
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
