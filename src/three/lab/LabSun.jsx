// Dev-only Sun inspector — owner: LEAD (SUNFALL Stage S2).
//   /lab/sun?q=auto|high|low&fit=2.4&still=1&no=prominences,corona,chromosphere&i=1.6
// All settings live in the URL so a view can be shared and reproduced.

import { useSearchParams } from 'react-router'
import SunViewport from '../viewports/SunViewport.jsx'

const FRAMES = [
  { key: '2.4', label: 'Whole Sun + corona' },
  { key: '1.15', label: 'Disc' },
  { key: '0.85', label: 'Close-up (SUNFALL)' },
]
const LAYERS = ['prominences', 'chromosphere', 'corona']

export default function LabSun() {
  const [search, setSearch] = useSearchParams()
  const quality = ['high', 'low'].includes(search.get('q')) ? search.get('q') : 'auto'
  const fit = Number(search.get('fit')) || 2.4
  const still = search.get('still') === '1'
  const intensity = Number(search.get('i')) || 1.9
  const off = new Set((search.get('no') ?? '').split(',').filter(Boolean))
  const layers = Object.fromEntries(LAYERS.map((l) => [l, !off.has(l)]))

  const set = (k, v) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p)
        if (v == null || v === '') next.delete(k)
        else next.set(k, v)
        return next
      },
      { replace: true },
    )
  const toggleLayer = (l) => {
    const next = new Set(off)
    if (next.has(l)) next.delete(l)
    else next.add(l)
    set('no', [...next].join(','))
  }

  return (
    <div className="lab-sun">
      <div className="lab-sun__stage">
        <SunViewport key={`${quality}`} quality={quality} reducedMotion={still} fit={fit} intensity={intensity} layers={layers} />
      </div>
      <details className="lab-sun__panel" open>
        <summary>Sun settings</summary>
        <fieldset>
          <legend>Quality</legend>
          {['auto', 'high', 'low'].map((q) => (
            <button key={q} type="button" aria-pressed={quality === q} onClick={() => set('q', q === 'auto' ? null : q)}>
              {q}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Framing</legend>
          {FRAMES.map((f) => (
            <button key={f.key} type="button" aria-pressed={String(fit) === f.key} onClick={() => set('fit', f.key)}>
              {f.label}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Layers</legend>
          {LAYERS.map((l) => (
            <label key={l}>
              <input type="checkbox" checked={layers[l]} onChange={() => toggleLayer(l)} /> {l}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Brightness {intensity.toFixed(2)}</legend>
          <input type="range" min="0.8" max="3.5" step="0.05" value={intensity} onChange={(e) => set('i', e.target.value)} aria-label="Photosphere brightness" />
        </fieldset>
        <label>
          <input type="checkbox" checked={still} onChange={(e) => set('still', e.target.checked ? '1' : null)} /> reduced motion (frozen)
        </label>
      </details>
    </div>
  )
}
