// Dev-only SUNFALL swarm inspector — owner: LEAD (Stage S3).
//   /lab/sunfall?id=<planet>&q=auto|high|low&still=1
// Lab fixtures (real NASA rows) plus synthetic radius cases: upper and lower
// limits, missing and imputed radii, and a model estimate.

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { sunfallResult } from '../../science/sunfall.js'
import SunfallViewport from '../viewports/SunfallViewport.jsx'
import { SUNFALL_LAB_PLANETS } from './sunfallLabPlanets.js'

export default function LabSunfall() {
  const [search, setSearch] = useSearchParams()
  const planet = SUNFALL_LAB_PLANETS.find((p) => p.id === search.get('id')) ?? SUNFALL_LAB_PLANETS.find((p) => p.name === 'WASP-12 b') ?? SUNFALL_LAB_PLANETS[0]
  const quality = ['high', 'low'].includes(search.get('q')) ? search.get('q') : 'auto'
  const still = search.get('still') === '1'
  const result = useMemo(() => sunfallResult(planet), [planet])

  const set = (k, v) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p)
        if (v == null) next.delete(k)
        else next.set(k, v)
        return next
      },
      { replace: true },
    )

  return (
    <div className="lab-sun">
      <div className="lab-sun__stage">
        <SunfallViewport key={`${planet.id}-${quality}-${still}`} planet={planet} result={result} quality={quality} reducedMotion={still} />
      </div>
      <details className="lab-sun__panel lab-sun__panel--top">
        <summary>SUNFALL settings</summary>
        <label>
          Planet{' '}
          <select value={planet.id} onChange={(e) => set('id', e.target.value)}>
            {SUNFALL_LAB_PLANETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Quality</legend>
          {['auto', 'high', 'low'].map((q) => (
            <button key={q} type="button" aria-pressed={quality === q} onClick={() => set('q', q === 'auto' ? null : q)}>
              {q}
            </button>
          ))}
        </fieldset>
        <label>
          <input type="checkbox" checked={still} onChange={(e) => set('still', e.target.checked ? '1' : null)} /> reduced motion
        </label>
        <pre className="lab-sun__debug">
          {JSON.stringify({ status: result.status, relation: result.relation, ratio: result.ratio && Number(result.ratio.toPrecision(6)), display: result.display, provenance: result.radiusProvenance }, null, 1)}
        </pre>
      </details>
    </div>
  )
}
