// Planet size comparison for /compare — owner: UI (implemented by LEAD,
// Stage 2c). Plain SVG circles on a shared baseline: radius only, no
// colours or surfaces implied. Model in sizeView.js.

import { useState } from 'react'
import { describeBody, sizeBodies } from './sizeView.js'

const MODES = [
  { key: 'visibility', label: 'Visibility scale' },
  { key: 'true', label: 'True scale' },
]
const NO_SIZE_PX = 22

function Body({ b }) {
  if (!b.drawable) {
    const d = NO_SIZE_PX * 2
    return (
      <svg className="size-svg" width={d + 4} height={d + 2} viewBox={`-2 -1 ${d + 4} ${d + 2}`} aria-hidden="true">
        <circle className="size-c size-c--none" cx={d / 2} cy={d / 2} r={NO_SIZE_PX} />
        <text className="size-q" x={d / 2} y={d / 2} dy="0.35em" textAnchor="middle">
          ?
        </text>
      </svg>
    )
  }
  if (b.subpixel) {
    return (
      <svg className="size-svg" width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
        <line className="size-tick" x1="6" y1="0" x2="6" y2="14" />
        <circle className="size-c size-c--measured" cx="6" cy="17" r="1" />
      </svg>
    )
  }
  const outer = Math.max(b.px, b.band?.[1] ?? 0)
  const w = Math.max(outer * 2, 4)
  const h = b.px * 2
  return (
    <svg className="size-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible" aria-hidden="true">
      {b.band && (
        <circle
          className="size-band"
          cx={w / 2}
          cy={b.px}
          r={(b.band[0] + b.band[1]) / 2}
          strokeWidth={Math.max(b.band[1] - b.band[0], 0.5)}
        />
      )}
      <circle className={`size-c size-c--${b.style}`} cx={w / 2} cy={b.px} r={b.px} />
    </svg>
  )
}

/**
 * @param {{ comparison: ReturnType<typeof import('../../science/compare.js').buildComparison>,
 *           planets: { id: string, name: string }[] }} props
 */
export default function SizeComparison({ comparison, planets }) {
  const [mode, setMode] = useState('visibility')
  const view = sizeBodies(comparison, planets, mode)
  const flags = {
    model: view.bodies.some((b) => b.style === 'model'),
    calculated: view.bodies.some((b) => b.style === 'calculated'),
    none: view.bodies.some((b) => !b.drawable),
    enlarged: view.bodies.some((b) => b.enlarged),
    subpixel: view.bodies.some((b) => b.subpixel),
    band: view.bodies.some((b) => b.band),
  }

  return (
    <section className="size" aria-labelledby="size-title">
      <div className="size-head">
        <div>
          <h2 id="size-title" className="cmp-h2">
            Sizes
          </h2>
          <p className="size-note">
            <strong>{view.note}.</strong> Circles compare radius only; colours and surfaces are not
            shown, and distances between planets are not to scale.
          </p>
        </div>
        <div className="size-modes" role="group" aria-label="Size scale">
          {MODES.map((m) => (
            <button key={m.key} type="button" className="size-mode" aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {view.drawn === 0 && <p className="size-empty">None of these planets has a catalogue radius, so no sizes can be drawn.</p>}

      <ul className="size-row">
        {view.bodies.map((b) => (
          <li key={b.id} className={`size-body${b.reference ? ' size-body--ref' : ''}`}>
            <div className="size-fig" role="img" aria-label={describeBody(b, view.isTrueScale)}>
              <Body b={b} />
            </div>
            <div className="size-label" aria-hidden="true">
              <span className="size-name">{b.name}</span>
              {b.valueText && <span className="size-value">{b.valueText}</span>}
              <span className={`size-tag size-tag--${b.style}`}>{b.tag}</span>
              {b.enlarged && <span className="size-flag">Enlarged to stay visible</span>}
              {b.subpixel && <span className="size-flag">Too small to see at true scale</span>}
              {!b.drawable && <span className="size-flag">Not drawn to any size</span>}
            </div>
          </li>
        ))}
      </ul>

      <ul className="size-keys">
        <li>
          <span className="size-key size-key--measured" /> Measured radius
        </li>
        {flags.calculated && (
          <li>
            <span className="size-key size-key--calculated" /> Calculated by NASA from other values, not a direct measurement
          </li>
        )}
        {flags.model && (
          <li>
            <span className="size-key size-key--model" /> Model-based or estimated radius
          </li>
        )}
        {flags.none && (
          <li>
            <span className="size-key size-key--none" /> No usable radius in the catalogue: shown without a size
          </li>
        )}
        {comparison.includeEarth && (
          <li>
            <span className="size-key size-key--reference" /> Earth: reference radius, 1 R⊕
          </li>
        )}
        {flags.band && (
          <li>
            <span className="size-key size-key--band" /> Faint ring: radius uncertainty range
          </li>
        )}
      </ul>
    </section>
  )
}
