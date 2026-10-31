// Formatting for NASA sync status — owner: LEAD (M5 Phase A). Pure functions.

/** "31 Oct 2026, 01:52 UTC" */
export function formatUtc(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date}, ${time} UTC`
}

/** "3 h ago", "in 21 h", "just now" */
export function relative(isoString, now = Date.now()) {
  if (!isoString) return null
  const diff = Date.parse(isoString) - now
  const abs = Math.abs(diff)
  const unit = abs < 60_000 ? null : abs < 3_600_000 ? [Math.round(abs / 60_000), 'min'] : abs < 172_800_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'days']
  if (!unit) return diff > 0 ? 'in under a minute' : 'just now'
  return diff > 0 ? `in ${unit[0]} ${unit[1]}` : `${unit[0]} ${unit[1]} ago`
}

export const RESULT_LABELS = {
  updated: 'New NASA data applied',
  unchanged: 'Checked · no changes at NASA',
  failed: 'Failed · NASA unreachable or incomplete',
  rejected: 'Rejected · NASA data failed validation',
}

export const ORIGIN_LABELS = {
  live: 'synced from NASA in this server run',
  runtime: 'latest validated sync',
  backup: 'last-known-good backup',
  seed: 'bundled snapshot',
}

/** "+3 new · 1 removed · 12 updated", or "No changes". */
export function changesText(changes) {
  if (!changes) return null
  const parts = []
  if (changes.added) parts.push(`${changes.added} new`)
  if (changes.removed) parts.push(`${changes.removed} removed`)
  if (changes.updated) parts.push(`${changes.updated} updated`)
  return parts.length ? parts.join(' · ') : 'No changes'
}

/** Health of the sync for a status dot: ok | warn | off. */
export function syncHealth(status) {
  if (!status?.sync?.enabled) return 'off'
  return status.sync.consecutiveFailures > 0 ? 'warn' : 'ok'
}
