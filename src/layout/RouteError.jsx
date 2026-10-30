// Route-level error screen — owner: UI. M0 placeholder.

import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export default function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error?.message ?? 'Unknown error'
  return (
    <section style={{ padding: 'var(--space-8) var(--space-6)' }}>
      <h1>Something went wrong</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>{message}</p>
      <Link to="/">Return to CELESTRIA</Link>
    </section>
  )
}
