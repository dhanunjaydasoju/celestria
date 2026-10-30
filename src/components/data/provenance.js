// Provenance key for display — owner: UI (implemented by LEAD).

/**
 * Provenance key for a Quantity: Msini masses become 'minimum'; imputed
 * (visual-only) values are never shown as data, so they read as missing.
 * @param {import('../../contracts/planet.js').Quantity|null|undefined} q
 */
export function provenanceKey(q) {
  if (!q || q.value == null || q.status === 'missing' || q.status === 'imputed') return 'missing'
  if (q.kind === 'Msini') return 'minimum'
  if (q.assumed) return 'assumed'
  return ['measured', 'calculated', 'estimated'].includes(q.status) ? q.status : 'measured'
}
