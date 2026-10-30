// Number formatting for 3D overlays — owner: LEAD.

const UNITS = {
  radiusEarth: 'R⊕',
  massEarth: 'M⊕',
  eqTempK: 'K',
  insolationEarth: 'S⊕',
}

const FIELD_LABELS = {
  radiusEarth: 'radius',
  massEarth: 'mass',
  eqTempK: 'equilibrium temperature',
  insolationEarth: 'insolation',
}

/** 3 significant figures, no exponent for everyday magnitudes. */
export function sig(value, digits = 3) {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e5 || (abs > 0 && abs < 1e-3)) return value.toExponential(digits - 1)
  return Number(value.toPrecision(digits)).toLocaleString('en-US')
}

/**
 * "radius 0.92 R⊕ (measured)"
 * @param {{ field: string, value: number, status: string, note?: string }|null} basis
 */
export function describeBasis(basis) {
  if (!basis) return null
  const label = basis.note === 'minimum mass' ? 'minimum mass' : FIELD_LABELS[basis.field] ?? basis.field
  return `${label} ${sig(basis.value)} ${UNITS[basis.field] ?? ''}`.trim() + ` (${basis.status})`
}
