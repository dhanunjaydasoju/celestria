// Measurement formatting — owner: UI (implemented by LEAD for the planet
// profile). Rounds values to the precision their uncertainty supports:
// uncertainties to 2 significant figures, the value to the same decimal place.

const sigFigs = (v, n) => Number(v.toPrecision(n))

function decimalsFor(err) {
  const e = Math.abs(err)
  if (!(e > 0)) return null
  return Math.max(0, 1 - Math.floor(Math.log10(e)))
}

const fmt = (v, decimals) =>
  v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/**
 * @param {number} value
 * @param {[number, number]} [err]   [+upper, −lower]
 * @param {{ maxSig?: number }} [opts]  significant figures when no uncertainty
 * @returns {{ value: string, plus?: string, minus?: string, symmetric?: boolean }}
 */
export function formatMeasurement(value, err, { maxSig = 4 } = {}) {
  if (value == null || !Number.isFinite(value)) return { value: '—' }
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return { value: value.toExponential(maxSig - 1) }
  }
  if (err && Number.isFinite(err[0]) && Number.isFinite(err[1]) && (err[0] !== 0 || err[1] !== 0)) {
    const d = decimalsFor(Math.min(...[err[0], err[1]].map(Math.abs).filter((e) => e > 0)))
    if (d != null && d <= 8) {
      const up = Math.abs(err[0])
      const down = Math.abs(err[1])
      const out = { value: fmt(value, d), plus: fmt(up, d), minus: fmt(down, d) }
      out.symmetric = out.plus === out.minus
      return out
    }
  }
  const s = sigFigs(value, maxSig)
  return { value: s.toLocaleString('en-US', { maximumFractionDigits: 8 }) }
}
