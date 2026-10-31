// npm run data:snapshot — refresh server/data/catalog.snapshot.json.gz from NASA.
// Exits non-zero (and leaves the existing snapshot untouched) on any failure.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { refreshSnapshot } from '../nasa/refresh.js'

const SNAPSHOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/catalog.snapshot.json.gz')
const result = await refreshSnapshot(SNAPSHOT, {
  log: console.log,
  onRetry: ({ attempt, delayMs, error }) => console.log(`  retry ${attempt} in ${delayMs} ms (${error.message})`),
})
process.exit(result.replaced ? 0 : 1)
