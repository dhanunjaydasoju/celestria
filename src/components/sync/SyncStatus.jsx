// NASA data freshness and sync status — owner: LEAD (M5 Phase A).
// Reads the public /api/sync/status via the store. The only action offered is
// the anonymous, cooldown-limited "check for updates"; admin refresh is a
// server-side tool and never appears here.

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { catalogUpdateAvailable } from '../../store/syncSlice.js'
import { useCelestria } from '../../store/useCelestria.js'
import { changesText, formatUtc, ORIGIN_LABELS, relative, RESULT_LABELS, syncHealth } from './syncFormat.js'
import './Sync.css'

/** Re-render every minute so relative times stay true. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** One line: when the served NASA data was last successfully synced. */
export function DataFreshness() {
  const status = useCelestria((s) => s.syncStatus)
  const now = useMinuteClock()
  if (!status) return null
  const { sync, catalog } = status
  const health = syncHealth(status)
  return (
    <p className="sync-line">
      <span className={`sync-dot sync-dot--${health}`} aria-hidden="true" />
      <span>
        NASA data · {sync.lastSuccessAt ? `synced ${relative(sync.lastSuccessAt, now)}` : `retrieved ${formatUtc(catalog?.retrievedAt)}`}
        {sync.running ? ' · syncing now' : health === 'warn' ? ' · last attempt failed' : ''}
      </span>
    </p>
  )
}

/** Banner when the server holds newer NASA data than this session loaded. */
export function UpdateNotice() {
  const available = useCelestria(catalogUpdateAvailable)
  const status = useCelestria((s) => s.syncStatus)
  const reloadCatalog = useCelestria((s) => s.reloadCatalog)
  const [dismissedFor, setDismissedFor] = useState(null)
  const served = status?.catalog?.retrievedAt
  if (!available || dismissedFor === served) return null
  const changes = changesText(status.sync.lastChanges)
  return (
    <div className="sync-notice" role="status">
      <span>
        Newer NASA data is available{changes && changes !== 'No changes' ? ` (${changes})` : ''}.
      </span>
      <button type="button" onClick={() => reloadCatalog()}>
        Load it
      </button>
      <button type="button" className="sync-notice__dismiss" onClick={() => setDismissedFor(served)} aria-label="Dismiss">
        Later
      </button>
    </div>
  )
}

function Row({ label, children, hint }) {
  return (
    <div className="sync-row">
      <dt>{label}</dt>
      <dd>
        {children}
        {hint && <span className="sync-row__hint">{hint}</span>}
      </dd>
    </div>
  )
}

/** Full status for the About page, with the anonymous update check. */
export function SyncPanel() {
  const status = useCelestria((s) => s.syncStatus)
  const syncCheck = useCelestria((s) => s.syncCheck)
  const syncStatusAt = useCelestria((s) => s.syncStatusAt)
  const checkForUpdates = useCelestria((s) => s.checkForUpdates)
  const now = useMinuteClock()
  const [busy, setBusy] = useState(false)

  if (!status) {
    return (
      <section className="sync-panel" aria-labelledby="sync-title">
        <h2 id="sync-title" className="sync-panel__title">NASA data synchronisation</h2>
        <p className="sync-muted">Sync status is not available (the server may be offline or running from fixtures).</p>
      </section>
    )
  }
  const { sync, catalog } = status
  const changes = changesText(sync.lastChanges)
  const ex = sync.lastChanges?.examples
  // Server-reported cooldown (from status or a refused check), counted down locally.
  const fromStatus = sync.checkAvailableInS && syncStatusAt ? sync.checkAvailableInS - (now - syncStatusAt) / 1000 : 0
  const fromCheck = syncCheck?.reason === 'cooldown' ? syncCheck.retryAfterS - (now - syncCheck.at) / 1000 : 0
  const cooldownS = Math.max(0, Math.ceil(Math.max(fromStatus, fromCheck)))

  return (
    <section className="sync-panel" aria-labelledby="sync-title">
      <h2 id="sync-title" className="sync-panel__title">NASA data synchronisation</h2>
      <p className="sync-muted">
        CELESTRIA keeps a validated copy of the {status.source} and re-syncs it {sync.enabled ? `every ${sync.intervalHours} hours` : 'only when started manually'}. New data
        replaces the old only after every check passes; if NASA is unavailable, the last valid catalogue keeps being served.
      </p>
      <dl className="sync-grid">
        <Row label="Last successful sync" hint={sync.lastSuccessAt ? relative(sync.lastSuccessAt, now) : null}>
          {formatUtc(sync.lastSuccessAt) ?? 'Not yet in this deployment'}
        </Row>
        <Row label="Last attempt" hint={sync.lastAttemptAt ? relative(sync.lastAttemptAt, now) : null}>
          {sync.lastAttemptAt ? `${formatUtc(sync.lastAttemptAt)} · ${RESULT_LABELS[sync.lastAttemptResult] ?? sync.lastAttemptResult}` : 'None yet'}
        </Row>
        <Row label="Catalogue served" hint={catalog ? ORIGIN_LABELS[catalog.origin] : null}>
          {catalog ? `${catalog.count.toLocaleString('en-US')} planets · retrieved ${formatUtc(catalog.retrievedAt)}` : '—'}
        </Row>
        <Row label="Changes detected" hint={sync.lastChangeAt ? `last change ${formatUtc(sync.lastChangeAt)}` : null}>
          {changes ?? 'No sync has compared catalogues yet'}
          {ex && (ex.added.length > 0 || ex.updated.length > 0) && (
            <span className="sync-row__hint">
              {ex.added.length > 0 && `New: ${ex.added.join(', ')}`}
              {ex.added.length > 0 && ex.updated.length > 0 && ' · '}
              {ex.updated.length > 0 && `Updated: ${ex.updated.join(', ')}`}
            </span>
          )}
        </Row>
        <Row label="Next scheduled sync" hint={sync.nextScheduledAt ? relative(sync.nextScheduledAt, now) : null}>
          {sync.running ? 'Syncing now…' : (formatUtc(sync.nextScheduledAt) ?? 'Automatic sync is off')}
        </Row>
        {sync.lastError && (
          <Row label="Recent error" hint={`${formatUtc(sync.lastError.at)} · stage: ${sync.lastError.stage}`}>
            <span className="sync-error">{sync.lastError.message}</span>
          </Row>
        )}
      </dl>
      <div className="sync-actions">
        <button
          type="button"
          className="sync-check"
          disabled={busy || sync.running || cooldownS > 0}
          onClick={async () => {
            setBusy(true)
            await checkForUpdates()
            setBusy(false)
          }}
        >
          <RefreshCw size={14} className={sync.running ? 'sync-spin' : undefined} aria-hidden="true" />
          {sync.running ? 'Syncing with NASA…' : 'Check NASA for updates'}
        </button>
        <span className="sync-muted" role="status">
          {cooldownS > 0
            ? `NASA was checked recently; next check available in ${Math.ceil(cooldownS / 60)} min.`
            : syncCheck?.reason === 'rate_limited'
              ? 'Too many checks from this device. Please wait.'
              : syncCheck?.reason === 'network'
                ? syncCheck.message
                : syncCheck?.accepted
                  ? 'Check started. This page updates when it finishes.'
                  : 'At most one check every 15 minutes for everyone.'}
        </span>
      </div>
    </section>
  )
}
