// Selected-planet cards for /compare — owner: UI (implemented by LEAD, Stage 2b).

import { ArrowUpRight, X } from 'lucide-react'
import { Link } from 'react-router'
import { visualParams } from '../../three/planet/visualParams.js'

/** @param {{ planet: import('../../contracts/planet.js').Planet, slot: number, onRemove: () => void }} props */
export function PlanetCard({ planet, slot, onRemove }) {
  const v = visualParams(planet)
  const d = planet.discovery ?? {}
  return (
    <li className="cmp-card">
      <div className="cmp-card__top">
        <span className="cmp-slot" aria-hidden="true">
          {slot}
        </span>
        <button type="button" className="cmp-iconbtn" onClick={onRemove} aria-label={`Remove ${planet.name} from the comparison`} title="Remove">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <h2 className="cmp-card__name">{planet.name}</h2>
      <p className="cmp-card__host">Orbits {planet.host}</p>
      <p className="cmp-card__meta">
        {v.archetypeLabel}
        {v.thermal !== 'unknown' && ` · ${v.thermalLabel}`}
      </p>
      <p className="cmp-card__meta">
        {d.method ?? 'Discovery method unknown'}
        {d.year && ` · ${d.year}`}
      </p>
      <p className="cmp-card__coverage">
        {v.coverage.available} of {v.coverage.total} key measurements in the catalogue
      </p>
      <Link to={`/planet/${planet.id}`} className="cmp-card__link">
        Full profile <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </li>
  )
}

export function EarthCard() {
  return (
    <li className="cmp-card cmp-card--ref">
      <div className="cmp-card__top">
        <span className="cmp-slot cmp-slot--ref" aria-hidden="true">
          ⊕
        </span>
      </div>
      <h2 className="cmp-card__name">Earth</h2>
      <p className="cmp-card__host">Orbits the Sun</p>
      <p className="cmp-card__meta">Reference values</p>
      <p className="cmp-card__coverage">From NASA fact sheets and IAU nominal constants. Not counted towards the four planets and never ranked.</p>
    </li>
  )
}
