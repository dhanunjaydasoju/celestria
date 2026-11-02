// SUNFALL page helpers — owner: LEAD (SUNFALL S4). Pure.

import { FEATURED_PLANET_IDS } from '../../data/featured.js'
import { formatMeasurement } from '../../components/data/formatMeasurement.js'
import { sunfallResult } from '../../science/sunfall.js'

const DEFAULT_ID = 'kepler-16-b'

/**
 * Planet opened by the SUNFALL menu entry: Kepler-16 b, else the first
 * featured planet with a usable radius, else the first catalogue planet.
 * @param {Record<string, object>} byId
 * @param {{ id: string }[]} planets
 */
export function defaultSunfallId(byId, planets) {
  if (byId[DEFAULT_ID]) return DEFAULT_ID
  const featured = FEATURED_PLANET_IDS.find((id) => byId[id] && sunfallResult(byId[id]).status !== 'unavailable')
  return featured ?? planets[0]?.id ?? null
}

const PROVENANCE = {
  measured: 'Measured',
  calculated: 'Calculated by NASA',
  estimated: 'Estimated',
  minimum: 'Minimum',
  assumed: 'Assumed',
}

/**
 * Radius line for the SUNFALL toolbar: value with uncertainty or limit,
 * provenance, or why there is none.
 * @param {ReturnType<typeof sunfallResult>} result
 * @returns {{ available: boolean, text: string, provenance: string|null, kind: string }}
 */
export function radiusSummary(result) {
  const r = result?.radius
  if (!result || result.status === 'unavailable' || !r || r.value == null) {
    return { available: false, text: 'Radius not in the catalogue', provenance: null, kind: 'missing' }
  }
  // A limit is a bound: its value is shown without an uncertainty, as in S1.
  const f = formatMeasurement(r.value, r.limit ? undefined : r.err)
  const unc = f.plus ? (f.symmetric ? ` ± ${f.plus}` : ` +${f.plus} −${f.minus}`) : ''
  const limit = r.limit ? `${r.limit} ` : ''
  const provenance = r.modelBased ? 'Model-based' : PROVENANCE[r.kind] ?? 'Measured'
  const bound = r.limit === '<' ? ' (upper limit)' : r.limit === '>' ? ' (lower limit)' : ''
  return { available: true, text: `${limit}${f.value}${unc} R⊕${bound}`, provenance, kind: r.modelBased ? 'estimated' : r.kind }
}
