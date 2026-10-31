// Catalogue files: committed seed + runtime current/backup — owner: DATA
// (implemented by LEAD in M5 Phase A).
//
//   server/data/catalog.snapshot.json.gz      committed seed — read only here
//   <runtimeDir>/catalog.current.json.gz      latest validated sync
//   <runtimeDir>/catalog.previous.json.gz     last-known-good backup
//   <runtimeDir>/sync-status.json             sync history (survives restarts)
//
// <runtimeDir> defaults to server/data/runtime/ (git-ignored). A candidate is
// written to a temp file, read back and fingerprint-checked before the files
// rotate (current → previous, candidate → current). The seed is never written.

import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readSnapshot, writeSnapshotAtomic } from './snapshot.js'
import { fingerprint, validateProcessed } from './validateProcessed.js'

/**
 * @param {{ seedPath: string, runtimeDir: string, log?: (m: string) => void }} opts
 */
export function createCatalogStorage({ seedPath, runtimeDir, log = () => {} }) {
  const paths = {
    seed: seedPath,
    current: path.join(runtimeDir, 'catalog.current.json.gz'),
    previous: path.join(runtimeDir, 'catalog.previous.json.gz'),
    candidate: path.join(runtimeDir, 'catalog.candidate.json.gz'),
    status: path.join(runtimeDir, 'sync-status.json'),
  }

  /** A readable, structurally valid catalogue file, or null with a reason. */
  async function tryRead(file) {
    if (!existsSync(file)) return { dataset: null, reason: 'not present' }
    try {
      const dataset = await readSnapshot(file)
      const check = validateProcessed(dataset.planets)
      if (!check.ok) return { dataset: null, reason: `invalid: ${check.errors.slice(0, 2).join('; ')}` }
      if (!dataset.meta?.retrievedAt) return { dataset: null, reason: 'no retrieval time' }
      return { dataset, reason: null }
    } catch (err) {
      return { dataset: null, reason: `unreadable: ${err.message}` }
    }
  }

  /**
   * Newest valid catalogue among runtime current, runtime backup and seed.
   * @returns {Promise<{ dataset: object, origin: 'runtime'|'backup'|'seed', rejected: { origin: string, reason: string }[] }>}
   */
  async function loadBest() {
    const rejected = []
    const valid = []
    for (const [origin, file] of [['runtime', paths.current], ['backup', paths.previous], ['seed', paths.seed]]) {
      const { dataset, reason } = await tryRead(file)
      if (dataset) valid.push({ origin, dataset })
      else if (reason !== 'not present' || origin === 'seed') rejected.push({ origin, reason })
    }
    if (!valid.length) throw new Error(`No valid catalogue: ${rejected.map((r) => `${r.origin} ${r.reason}`).join('; ')}`)
    valid.sort((a, b) => Date.parse(b.dataset.meta.retrievedAt) - Date.parse(a.dataset.meta.retrievedAt))
    for (const r of rejected) log(`Catalogue ${r.origin} skipped: ${r.reason}`)
    return { ...valid[0], rejected }
  }

  /**
   * Make a validated dataset the current runtime catalogue, keeping the
   * replaced one as the backup. Throws (leaving files as they were) if the
   * written candidate does not read back identically.
   */
  async function promote(dataset) {
    await mkdir(runtimeDir, { recursive: true })
    const bytes = await writeSnapshotAtomic(paths.candidate, dataset)
    try {
      const back = await readSnapshot(paths.candidate)
      if (fingerprint(back.planets) !== fingerprint(dataset.planets) || back.planets.length !== dataset.planets.length) {
        throw new Error('written catalogue did not read back identically')
      }
    } catch (err) {
      await rm(paths.candidate, { force: true })
      throw err
    }
    // Backup = what was current before (or the seed on the first sync).
    const backupSource = existsSync(paths.current) ? paths.current : paths.seed
    const backupTmp = `${paths.previous}.tmp-${process.pid}`
    await copyFile(backupSource, backupTmp)
    await rename(backupTmp, paths.previous)
    await rename(paths.candidate, paths.current)
    return { bytes }
  }

  async function readStatus() {
    try {
      return JSON.parse(await readFile(paths.status, 'utf8'))
    } catch {
      return null
    }
  }

  async function writeStatus(status) {
    await mkdir(runtimeDir, { recursive: true })
    const tmp = `${paths.status}.tmp-${process.pid}`
    await writeFile(tmp, JSON.stringify(status, null, 2))
    await rename(tmp, paths.status)
  }

  return { paths, loadBest, promote, readStatus, writeStatus }
}
