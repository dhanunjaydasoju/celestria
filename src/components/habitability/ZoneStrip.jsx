// One planet's stellar flux against its star's habitable-zone boundaries —
// owner: AI (implemented by LEAD in M5 Phase B). Flux decreases to the right.

import { fluxScale, withErr } from './hzChart.js'

const W = 360
const H = 86
const X0 = 12
const X1 = W - 12
const BAND_Y = 26
const BAND_H = 22

/**
 * @param {{ zone: ReturnType<typeof import('../../science/habitability.js').evaluateZone> }} props
 */
export default function ZoneStrip({ zone }) {
  const b = zone.bounds
  const f = zone.flux
  if (!b) return null
  const fluxes = [b.recentVenus * 2.2, b.earlyMars / 2.2]
  if (f?.value) fluxes.push(f.value * 1.4, f.value / 1.4)
  const max = Math.min(Math.max(...fluxes), b.recentVenus * 12)
  const min = Math.max(Math.min(...fluxes), b.earlyMars / 12)
  const s = fluxScale(max, min, X0, X1)
  const clampX = (v) => Math.min(X1, Math.max(X0, s.toX(v)))
  const [plus, minus] = f?.err ? [Math.abs(f.err[0]), Math.abs(f.err[1])] : [0, 0]
  const off = f?.value && (f.value > max || f.value < min)
  const ticks = s.ticks.filter((t, i, all) => i % Math.ceil(all.length / 6) === 0)

  return (
    <figure className="hz-strip">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Stellar flux ${f ? withErr(f.value, f.err) : 'unknown'} S⊕ compared with the habitable-zone boundaries for this star`}>
        <rect className="hz-band hz-band--opt" x={s.toX(b.recentVenus)} y={BAND_Y} width={s.toX(b.earlyMars) - s.toX(b.recentVenus)} height={BAND_H} rx="3" />
        <rect className="hz-band hz-band--cons" x={s.toX(b.runawayGreenhouse)} y={BAND_Y} width={s.toX(b.maximumGreenhouse) - s.toX(b.runawayGreenhouse)} height={BAND_H} rx="3" />
        <text className="hz-band-label" x={(s.toX(b.runawayGreenhouse) + s.toX(b.maximumGreenhouse)) / 2} y={BAND_Y - 7} textAnchor="middle">
          Conservative
        </text>
        <text className="hz-band-label hz-band-label--muted" x={s.toX(b.recentVenus) - 4} y={BAND_Y - 7} textAnchor="end">
          ← hotter
        </text>
        <text className="hz-band-label hz-band-label--muted" x={s.toX(b.earlyMars) + 4} y={BAND_Y - 7}>
          colder →
        </text>
        <line className="hz-axis" x1={X0} x2={X1} y1={BAND_Y + BAND_H + 8} y2={BAND_Y + BAND_H + 8} />
        {ticks.map((t) => (
          <g key={t} transform={`translate(${s.toX(t)},${BAND_Y + BAND_H + 8})`}>
            <line className="hz-axis" y2="4" />
            <text className="hz-tick" y="15" textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text className="hz-tick" x={X1} y={H - 1} textAnchor="end">
          S⊕
        </text>
        {zone.orbit && (
          <line className="hz-orbit" x1={clampX(zone.orbit.periastronFlux)} x2={clampX(zone.orbit.apoastronFlux)} y1={BAND_Y + BAND_H / 2} y2={BAND_Y + BAND_H / 2} />
        )}
        {f?.value != null && !f.limit && (
          <g>
            {(plus > 0 || minus > 0) && <line className="hz-err" x1={clampX(f.value + plus)} x2={clampX(f.value - minus)} y1={BAND_Y + BAND_H / 2} y2={BAND_Y + BAND_H / 2} />}
            <circle className={`hz-dot${off ? ' hz-dot--off' : ''}`} cx={clampX(f.value)} cy={BAND_Y + BAND_H / 2} r="5" />
          </g>
        )}
      </svg>
      <figcaption>
        {f?.value != null ? (
          <>
            Planet flux <span className="num">{withErr(f.value, f.err)} S⊕</span> ({f.status === 'calculated' && f.basis?.startsWith('S =') ? 'calculated from luminosity and orbit' : f.status})
            {off ? ' · beyond the plotted range' : ''}
            {zone.orbit ? ' · dotted line: flux range from periastron to apoastron' : ''}.
          </>
        ) : (
          'Planet flux unavailable.'
        )}{' '}
        Bands: optimistic (light) and conservative (dark) zones for this star, Kopparapu et al. 2014.
      </figcaption>
    </figure>
  )
}
