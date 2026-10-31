// Habitable-zone diagram: stellar flux vs star temperature — owner: AI
// (implemented by LEAD in M5 Phase B). Bands are Kopparapu et al. 2014
// boundaries; points are planets with an estimated placement. Click a point
// to open its profile. The table on the dashboard is the accessible view.

import { useMemo, useRef, useState } from 'react'
import { PLACEMENT_LABELS, TEFF_MAX_K, TEFF_MIN_K } from '../../science/habitableZone.js'
import { bandPolygon, fluxScale, sizeClassOf, withErr } from './hzChart.js'

const W = 1000
const H = 540
const M = { l: 64, r: 20, t: 18, b: 52 }
const RANGES = { hz: [12, 0.06], full: null }
// Earth as a reference point: S = 1 S⊕ by definition; Sun Teff = 5772 K (IAU 2015 nominal).
const EARTH = { flux: 1, teff: 5772 }

const yOf = (t) => M.t + ((TEFF_MAX_K - t) / (TEFF_MAX_K - TEFF_MIN_K)) * (H - M.t - M.b)

/**
 * @param {{ planets: object[], range: 'hz'|'full', showErrors: boolean, onOpen: (id: string) => void }} props
 */
export default function HZDiagram({ planets, range, showErrors, onOpen }) {
  const svg = useRef(null)
  const [hover, setHover] = useState(null)

  const domain = useMemo(() => {
    if (RANGES[range]) return RANGES[range]
    const f = planets.map((p) => p.flux.value).filter((v) => v > 0)
    return [Math.max(...f, 12) * 1.3, Math.min(...f, 0.06) / 1.3]
  }, [planets, range])
  const sx = useMemo(() => fluxScale(domain[0], domain[1], M.l, W - M.r), [domain])

  const { shown, hotter, colder } = useMemo(() => {
    let hot = 0
    let cold = 0
    const pts = []
    for (const p of planets) {
      const f = p.flux.value
      if (f > domain[0]) hot++
      else if (f < domain[1]) cold++
      else pts.push({ ...p, x: sx.toX(f), y: yOf(p.teff.value), cls: sizeClassOf(p.radius?.value ?? null) })
    }
    return { shown: pts, hotter: hot, colder: cold }
  }, [planets, domain, sx])

  const { opt, cons } = useMemo(() => {
    const path = (poly) => poly.map(([f, t], i) => `${i ? 'L' : 'M'}${Math.min(W - M.r, Math.max(M.l, sx.toX(f))).toFixed(1)},${yOf(t).toFixed(1)}`).join('') + 'Z'
    return { opt: path(bandPolygon('recentVenus', 'earlyMars')), cons: path(bandPolygon('runawayGreenhouse', 'maximumGreenhouse')) }
  }, [sx])
  // Around the zone: 1-2-5 ticks; whole catalogue: decades only.
  const xTicks = range === 'hz' ? sx.ticks : sx.ticks.filter((t) => Math.log10(t) % 1 === 0)

  /** Nearest point within 14 px of the pointer (hit target larger than the mark). */
  const pick = (e) => {
    const el = svg.current
    if (!el) return null
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(el.getScreenCTM().inverse())
    let best = null
    let bestD = 14 * 14
    for (const s of shown) {
      const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  return (
    <div className="hz-chart-wrap">
      <svg
        ref={svg}
        className="hz-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Habitable-zone diagram: ${shown.length} planets plotted by stellar flux and star temperature, with conservative and optimistic habitable-zone bands. The table below lists the same planets.`}
        onPointerMove={(e) => setHover(pick(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const p = pick(e)
          if (p) onOpen(p.id)
        }}
        style={{ cursor: hover ? 'pointer' : 'default' }}
      >
        {/* grid and axes */}
        {[3000, 4000, 5000, 6000, 7000].map((t) => (
          <g key={t}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={yOf(t)} y2={yOf(t)} />
            <text className="tick" x={M.l - 8} y={yOf(t) + 3} textAnchor="end">
              {t.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t}>
            <line className="grid" x1={sx.toX(t)} x2={sx.toX(t)} y1={M.t} y2={H - M.b} />
            <text className="tick" x={sx.toX(t)} y={H - M.b + 16} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text className="axis-label" x={(M.l + W - M.r) / 2} y={H - 10} textAnchor="middle">
          Stellar flux received (S⊕, Earth = 1) · more starlight ← → less starlight
        </text>
        <text className="axis-label" transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">
          Star effective temperature (K)
        </text>

        {/* zones */}
        <path className="band-opt" d={opt} />
        <path className="band-cons" d={cons} />
        <text className="band-label" x={sx.toX(0.62)} y={yOf(7050)} textAnchor="middle">
          Conservative
        </text>
        <text className="band-label" x={Math.min(W - M.r - 4, sx.toX(0.25))} y={yOf(2750)} textAnchor="start">
          Optimistic
        </text>

        {/* Earth reference */}
        {EARTH.flux <= domain[0] && EARTH.flux >= domain[1] && (
          <g transform={`translate(${sx.toX(EARTH.flux)} ${yOf(EARTH.teff)})`} aria-hidden="true">
            <circle r="6" fill="none" stroke="var(--color-text)" strokeWidth="1.2" />
            <line x1="-6" x2="6" stroke="var(--color-text)" strokeWidth="1.2" />
            <line y1="-6" y2="6" stroke="var(--color-text)" strokeWidth="1.2" />
            <text className="tick" x="10" y="-8">
              Earth (reference)
            </text>
          </g>
        )}

        {/* uncertainties then points */}
        {showErrors &&
          shown
            .filter((p) => p.flux.err)
            .map((p) => (
              <line
                key={`e-${p.id}`}
                className="err"
                x1={Math.max(M.l, sx.toX(p.flux.value + p.flux.err[0]))}
                x2={Math.min(W - M.r, sx.toX(Math.max(p.flux.value - p.flux.err[1], domain[1])))}
                y1={p.y}
                y2={p.y}
              />
            ))}
        {shown.map((p) => (
          <circle key={p.id} className={`pt pt--${p.cls}${hover?.id === p.id ? ' is-hover' : ''}`} cx={p.x} cy={p.y} r={hover?.id === p.id ? 6 : 4} />
        ))}

        {hotter > 0 && (
          <text className="offchart" x={M.l + 6} y={M.t + 14}>
            ← {hotter.toLocaleString('en-US')} planets receive more flux (off chart)
          </text>
        )}
        {colder > 0 && (
          <text className="offchart" x={W - M.r - 6} y={M.t + 14} textAnchor="end">
            {colder.toLocaleString('en-US')} receive less (off chart) →
          </text>
        )}
      </svg>

      {hover && (
        <div
          className="hz-tip"
          style={{
            left: `${Math.min(70, (hover.x / W) * 100)}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: `translate(${hover.x / W > 0.7 ? '-105%' : '12px'}, -50%)`,
          }}
        >
          <strong>{hover.name}</strong>
          <dl>
            <dt>Flux</dt>
            <dd>
              {withErr(hover.flux.value, hover.flux.err)} S⊕ <span className="hz-prov">{hover.flux.calculated ? 'calculated from luminosity and orbit' : hover.flux.status}</span>
            </dd>
            <dt>Star</dt>
            <dd>
              {withErr(hover.teff.value, hover.teff.err)} K{hover.spectralType ? ` · ${hover.spectralType}` : ''}
            </dd>
            <dt>Radius</dt>
            <dd>
              {hover.radius ? `${withErr(hover.radius.value, hover.radius.err)} R⊕` : 'Unavailable'} {hover.radius && <span className="hz-prov">{hover.radius.status}</span>}
            </dd>
            <dt>Zone</dt>
            <dd style={{ fontFamily: 'var(--font-ui)' }}>
              {PLACEMENT_LABELS[hover.placement]}
              {hover.straddles ? ' · straddles a boundary within uncertainties' : ''}
            </dd>
          </dl>
          <p className="hz-tip__hint">Click to open the profile</p>
        </div>
      )}
    </div>
  )
}
