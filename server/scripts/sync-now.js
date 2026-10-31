// npm run data:sync — ask the running server to sync with NASA now.
// Reads SYNC_ADMIN_TOKEN and API_PORT from .env (server side only); the token
// is sent in the Authorization header and never printed.
const token = process.env.SYNC_ADMIN_TOKEN
const base = process.env.SYNC_URL || `http://localhost:${process.env.API_PORT || 8787}`
if (!token) {
  console.error('SYNC_ADMIN_TOKEN is not set in .env (see .env.example).')
  process.exit(2)
}
const res = await fetch(`${base}/api/sync/refresh?wait=1`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch((err) => {
  console.error(`Could not reach ${base}: ${err.message}`)
  process.exit(1)
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`Sync not started (HTTP ${res.status}): ${body.error?.message ?? 'unknown error'}`)
  process.exit(1)
}
const s = body.status?.sync ?? {}
console.log(`Result: ${body.result ?? body.reason}`)
console.log(`Catalogue: ${body.status?.catalog?.count} planets, retrieved ${body.status?.catalog?.retrievedAt}`)
console.log(`Last success: ${s.lastSuccessAt ?? 'never'} · last attempt: ${s.lastAttemptAt ?? 'never'} (${s.lastAttemptResult ?? '—'})`)
if (s.lastChanges) console.log(`Changes: +${s.lastChanges.added} −${s.lastChanges.removed} ~${s.lastChanges.updated}`)
if (s.lastError) console.log(`Recent error (${s.lastError.stage}): ${s.lastError.message}`)
process.exit(body.result === 'failed' || body.result === 'rejected' ? 1 : 0)
