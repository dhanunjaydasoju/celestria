// assess_habitability tool for the AI astronomer — owner: AI (implemented by
// LEAD in M5 Phase B). Deterministic: runs src/science/habitability.js on
// the canonical planet record and formats the result like the other tools.
// The validator accepts habitable-zone placement claims only when they
// match a result of this tool (validate.js).

import { DISCLAIMER, STATUS_LABELS, assessHabitability } from '../../../src/science/habitability.js'
import { LIMIT_LABELS, REFERENCE, TEFF_MAX_K, TEFF_MIN_K } from '../../../src/science/habitableZone.js'
import { resolvePlanet } from './catalog.js'
import { formatQuantity, planetLinks } from './format.js'

const calc = (value, unit, basis) => (value == null || !Number.isFinite(value) ? null : { value: Number(value.toPrecision(4)), unit, status: 'calculated', display: `${Number(value.toPrecision(3))} ${unit}`, basis })

function fluxNode(flux) {
  if (!flux) return { status: 'unavailable', unit: 'S⊕', display: 'Unavailable' }
  if (flux.basis?.startsWith('S =')) {
    const node = calc(flux.value, 'S⊕', flux.basis)
    if (flux.err) node.uncertainty = { plus: Number(Math.abs(flux.err[0]).toPrecision(3)), minus: Number(Math.abs(flux.err[1]).toPrecision(3)) }
    return node
  }
  return formatQuantity(flux, 'insolationEarth')
}

/** assess_habitability */
export function assessHabitabilityTool(ctx, { name }) {
  const r = resolvePlanet(ctx, name)
  if (r.status !== 'found') {
    return r.status === 'ambiguous'
      ? { status: 'ambiguous', query: name, reason: r.reason, candidates: r.candidates, instruction: 'Ask the user which planet they mean; do not pick one.' }
      : { status: 'not_found', query: name, suggestions: r.suggestions }
  }
  const p = r.planet
  const a = assessHabitability(p)
  const z = a.zone
  const basis = z.boundsBasis
  const hz = {
    model: `${REFERENCE.label}, 1 Earth-mass planet; valid for stars of ${TEFF_MIN_K}–${TEFF_MAX_K} K`,
    status: z.status, // placed | limit | no_flux | no_teff | unsupported_teff | unsupported_star
    placement: z.placement ?? null,
    placementLabel: z.placementLabel ?? null,
    straddles: Boolean(z.straddles),
    placementsWithinUncertainty: z.placementsWithinUncertainty ?? [],
    reason: z.reason ?? null,
    planetFlux: fluxNode(z.flux),
    starTeff: formatQuantity(z.teff, 'star.teff'),
  }
  if (z.bounds) {
    hz.boundaryFlux = Object.fromEntries(Object.entries(z.bounds).map(([k, v]) => [k, { ...calc(v, 'S⊕', basis), label: LIMIT_LABELS[k] }]))
  }
  if (z.distancesAU) {
    hz.boundaryDistance = {
      conservativeInner: calc(z.distancesAU.conservative[0], 'AU', `${basis}; d = √(L★/S_eff)`),
      conservativeOuter: calc(z.distancesAU.conservative[1], 'AU', `${basis}; d = √(L★/S_eff)`),
      optimisticInner: calc(z.distancesAU.optimistic[0], 'AU', `${basis}; d = √(L★/S_eff)`),
      optimisticOuter: calc(z.distancesAU.optimistic[1], 'AU', `${basis}; d = √(L★/S_eff)`),
    }
  }
  if (z.orbit) {
    hz.orbit = {
      crossesBoundary: z.orbit.crossesBoundary,
      periastronFlux: calc(z.orbit.periastronFlux, 'S⊕', 'S/(1 − e)²'),
      apoastronFlux: calc(z.orbit.apoastronFlux, 'S⊕', 'S/(1 + e)²'),
    }
  }
  return {
    status: 'ok',
    planet: p.name,
    host: p.host,
    id: p.id,
    profileUrl: planetLinks(p).profileUrl,
    dashboardUrl: '/habitability',
    tier: { label: a.tier.label, status: 'classification', note: 'A qualitative summary of the indicators, not a probability or score.' },
    habitableZone: hz,
    indicators: a.factors.map((f) => ({ key: f.key, label: f.label, assessment: STATUS_LABELS[f.status], explanation: f.explanation, rule: f.rule })),
    disclaimer: DISCLAIMER,
    references: [{ label: REFERENCE.label, url: REFERENCE.url }],
  }
}
