// JSON responses with ETag and gzip via Node's built-in zlib (no extra
// dependency) — owner: DATA (LEAD in M4). Large payloads can be cached per
// data version with `cacheKey`.

import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

const cache = new Map()
const MAX_CACHE = 64

function encode(payload, cacheKey) {
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey)
  const body = Buffer.from(JSON.stringify(payload))
  const entry = { body, gz: body.length > 1024 ? gzipSync(body) : null }
  if (cacheKey) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
    cache.set(cacheKey, entry)
  }
  return entry
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {unknown} payload
 * @param {{ etag?: string, cacheKey?: string, maxAge?: number }} [opts]
 */
export function sendJson(req, res, payload, { etag, cacheKey, maxAge = 300 } = {}) {
  if (etag) {
    // Hashed so names with any characters stay valid in an HTTP header.
    const tag = `"${createHash('sha1').update(etag).digest('base64url').slice(0, 22)}"`
    res.setHeader('ETag', tag)
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`)
    if (req.headers['if-none-match'] === tag) return res.status(304).end()
  }
  const { body, gz } = encode(payload, cacheKey)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Vary', 'Accept-Encoding')
  if (gz && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.setHeader('Content-Encoding', 'gzip')
    return res.end(gz)
  }
  return res.end(body)
}

export const apiError = (res, status, code, message) => res.status(status).json({ error: { code, message } })
