// User-facing messages for pages that wait on the planet catalog — owner: LEAD.
// Pure, so every page words loading, failure, empty and not-found the same way.

/**
 * @param {{ status: 'idle'|'loading'|'ready'|'error', id?: string }} opts
 *   `id` is the planet the route asked for, if any.
 * @returns {{ kind: 'loading'|'error'|'empty'|'notFound', title: string|null, message: string }}
 *   `title` replaces the page title when the state needs its own (else null).
 */
export function catalogMessage({ status, id }) {
  if (status === 'error') {
    return { kind: 'error', title: 'Catalog unavailable', message: 'The planet catalog could not be loaded. Please refresh the page or try again later.' }
  }
  if (status !== 'ready') return { kind: 'loading', title: null, message: 'Loading catalog…' }
  if (id) {
    return {
      kind: 'notFound',
      title: 'Planet not found',
      message: `No confirmed planet matches “${id}”. The address may be mistyped, or the planet is not in the NASA Exoplanet Archive’s list of confirmed planets.`,
    }
  }
  return { kind: 'empty', title: 'Catalog unavailable', message: 'No planets are available right now. Please try again later.' }
}
