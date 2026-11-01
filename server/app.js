// Express app factory — owner: DATA (D3.2; LEAD in M4). Separate from
// index.js so tests can build an app around any catalogue store.

import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { askRouter } from './routes/ask.js'
import { catalogRouter } from './routes/catalog.js'
import { habitabilityRouter } from './routes/habitability.js'
import { syncRouter } from './routes/sync.js'

/**
 * @param {{
 *   store: ReturnType<typeof import('./nasa/catalogStore.js').createCatalogStore>,
 *   distDir?: string|null,
 *   ai?: { astronomer: object|null, config: { configured: boolean, model: string } } | null,
 *   trustProxy?: boolean|number,
 *   sync?: { sync: object|null, adminToken?: string|null } | null,
 * }} opts
 */
export function createApp({ store, distDir = null, ai = null, trustProxy = false, sync = null }) {
  const app = express()
  app.disable('x-powered-by')
  // Behind a hosting proxy, per-client AI limits need the real client IP.
  if (trustProxy) app.set('trust proxy', trustProxy)
  app.use(express.json({ limit: BODY_LIMIT }))

  app.use('/api', catalogRouter(store))
  app.use('/api', habitabilityRouter(store))
  app.use('/api', syncRouter(sync ?? { sync: null }))
  app.use('/api', askRouter(ai ?? { astronomer: null, config: { configured: false, model: '' } }))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } })
  })

  if (distDir) {
    if (!existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/ not found. Run `npm run build` first.')
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    // Client-side routes (e.g. /planet/kepler-22-b) all serve the SPA shell.
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
  }

  // Request-body errors from express.json() are the client's fault: answer
  // with a 4xx in the API error shape instead of a 500, and don't log them.
  app.use((err, _req, res, next) => {
    const body = BODY_ERRORS[err?.type]
    if (!body) return next(err)
    res.status(body.status).json({ error: { code: body.code, message: body.message } })
  })

  // Last-resort JSON error handler; never leak stack traces to clients.
  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ error: { code: 'UNKNOWN', message: 'Internal server error.' } })
  })
  return app
}

const BODY_LIMIT = '32kb'

// body-parser error types (err.type) → API error.
const BODY_ERRORS = {
  'entity.parse.failed': { status: 400, code: 'BAD_REQUEST', message: 'The request body is not valid JSON.' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: `The request body is larger than ${BODY_LIMIT}.` },
  'entity.verify.failed': { status: 400, code: 'BAD_REQUEST', message: 'The request body could not be read.' },
  'request.aborted': { status: 400, code: 'BAD_REQUEST', message: 'The request was aborted.' },
  'request.size.invalid': { status: 400, code: 'BAD_REQUEST', message: 'The request body size does not match its Content-Length.' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported request body encoding.' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported request body charset.' },
}
