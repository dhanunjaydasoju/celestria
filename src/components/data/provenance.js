// Provenance key for display — owner: UI (implemented by LEAD).

/**
 * Provenance key for a Quantity: Msini masses become 'minimum'. Imputed
 * values (CLAUDE.md §5a) read as missing unless the caller is an analysis
 * view that explicitly opts in with `allowImputed`.
 * @param {import('../../contracts/planet.js').Quantity|null|undefined} q
 * @param {{ allowImputed?: boolean }} [opts]
 */
export function provenanceKey(q, { allowImputed = false } = {}) {
  if (!q || q.value == null || q.status === 'missing') return 'missing'
  if (q.status === 'imputed') return allowImputed ? 'imputed' : 'missing'
  if (q.kind === 'Msini') return 'minimum'
  if (q.assumed) return 'assumed'
  return ['measured', 'calculated', 'estimated'].includes(q.status) ? q.status : 'measured'
}
