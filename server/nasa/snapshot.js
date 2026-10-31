// Catalogue snapshot: compact, gzipped, written atomically — owner: DATA
// (implemented by LEAD in M4). Sources are stored once in a table and
// referenced by index; reading restores full Quantity objects.

import { existsSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

export const SCHEMA_VERSION = 1

const isQuantity = (v) => v && typeof v === 'object' && 'status' in v && 'value' in v

function mapQuantities(planet, fn) {
  const walk = (node) => {
    if (isQuantity(node)) return fn(node)
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const out = {}
      for (const [k, v] of Object.entries(node)) out[k] = walk(v)
      return out
    }
    return node
  }
  return walk(planet)
}

/** @param {{ meta: object, planets: object[] }} dataset */
export function encodeSnapshot({ meta, planets }) {
  const sources = []
  const index = new Map()
  const encoded = planets.map((p) =>
    mapQuantities(p, (q) => {
      if (!q.source) return q
      const key = `${q.source.label}\u0000${q.source.url ?? ''}`
      if (!index.has(key)) {
        index.set(key, sources.length)
        sources.push(q.source)
      }
      const { source: _source, ...rest } = q
      return { ...rest, s: index.get(key) }
    }),
  )
  return { meta: { ...meta, schemaVersion: SCHEMA_VERSION }, sources, planets: encoded }
}

export function decodeSnapshot(snap) {
  if (snap?.meta?.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported snapshot schema ${snap?.meta?.schemaVersion}`)
  const planets = snap.planets.map((p) =>
    mapQuantities(p, (q) => {
      if (q.s == null) return q
      const { s, ...rest } = q
      return { ...rest, source: snap.sources[s] }
    }),
  )
  return { meta: snap.meta, planets }
}

export async function readSnapshot(path) {
  if (!existsSync(path)) return null
  const buf = await readFile(path)
  return decodeSnapshot(JSON.parse(gunzipSync(buf).toString('utf8')))
}

/** Write to a temp file, then rename: a crash never leaves a partial snapshot. */
export async function writeSnapshotAtomic(path, dataset) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  const gz = gzipSync(JSON.stringify(encodeSnapshot(dataset)), { level: 9 })
  try {
    await writeFile(tmp, gz)
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
  return gz.length
}
