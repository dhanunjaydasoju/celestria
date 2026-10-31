// Selected-planet panel for the system explorer — owner: LEAD.
// Seven key parameters by default; "View more" reveals the rest. Every value
// uses MeasurementRow, so provenance, uncertainty and units are preserved.

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import MeasurementRow from '../../components/data/MeasurementRow.jsx'
import ProvenanceBadge from '../../components/data/ProvenanceBadge.jsx'
import { isScientific } from '../../contracts/planet.js'
import { distanceLightYears, isFixedCircular, isModelBasedImaging } from '../../science/derived.js'
import { describeBasis, sig } from '../../three/shared/format.js'
import './PlanetInfoPanel.css'

function TextRow({ label, value, note }) {
  return (
    <div className={`mrow mrow--${value ? 'measured' : 'missing'}`}>
      <dt className="mrow__label">
        {label}
        {note && <span className="mrow__basis">{note}</span>}
      </dt>
      <dd className="mrow__value">
        {value ? <span className="mrow__number">{value}</span> : <span className="mrow__missing">Unavailable</span>}
        {!value && <ProvenanceBadge kind="missing" />}
      </dd>
    </div>
  )
}

const withBasis = (q, basis) => (basis && isScientific(q) ? { ...q, basis } : q)

/**
 * @param {{ entry: ReturnType<typeof import('../../three/system/systemModel.js').buildSystemModel>['planets'][number], profileHref: string }} props
 */
export default function PlanetInfoPanel({ entry, profileHref }) {
  const [expanded, setExpanded] = useState(false)
  const { planet, params, distance } = entry
  const star = planet.star ?? {}
  const imaged = isModelBasedImaging(planet)
  const modelNote = imaged ? 'Model-based (directly imaged planet)' : undefined
  const distanceLy = distanceLightYears(planet.system?.distancePc)

  // Semi-major axis: catalog value; in the system view a missing one may be
  // calculated from period + star mass (Kepler's third law).
  const aQuantity =
    distance.source === 'kepler'
      ? { value: distance.aAU, status: 'calculated', basis: "Kepler's third law from period and star mass" }
      : planet.semiMajorAxisAU

  return (
    <aside className="pip" aria-live="polite">
      <h2 className="pip__title">{planet.name}</h2>

      <dl className="pip__list">
        <TextRow
          label="Planet type"
          value={`${params.archetypeLabel}${params.thermal !== 'unknown' ? ` · ${params.thermalLabel}` : ''}`}
          note={params.sizeBasis ? `Visual class from ${describeBasis(params.sizeBasis)}` : undefined}
        />
        <MeasurementRow label="Radius" q={withBasis(planet.radiusEarth, modelNote)} unit="R⊕" />
        <MeasurementRow
          label={planet.massEarth?.kind === 'Msini' ? 'Mass (M sin i)' : 'Mass'}
          q={withBasis(planet.massEarth, planet.massEarth?.kind === 'M-R' ? "Estimated from NASA's mass–radius relation" : modelNote)}
          unit="M⊕"
        />
        <MeasurementRow label="Orbital period" q={planet.periodDays} unit="days" />
        <MeasurementRow label="Semi-major axis" q={aQuantity} unit="AU" unavailableReason="Position in this view is arbitrary" />
        <MeasurementRow label="Equilibrium temperature" q={planet.eqTempK} unit="K" />
      </dl>

      <div className={`pip__more${expanded ? ' is-open' : ''}`} id={`pip-more-${planet.id}`} aria-hidden={!expanded} inert={!expanded}>
        <div className="pip__more-inner">
          <h3 className="pip__sub">Orbit &amp; planet</h3>
          <dl className="pip__list">
            <MeasurementRow
              label="Eccentricity"
              q={
                isFixedCircular(planet.eccentricity)
                  ? { ...planet.eccentricity, assumed: true, basis: 'Fixed at 0 in the source fit; not measured' }
                  : planet.eccentricity
              }
            />
            <MeasurementRow label="Inclination" q={planet.inclinationDeg} unit="°" />
            <MeasurementRow label="Density" q={planet.densityGcc} unit="g/cm³" />
            <MeasurementRow label="Insolation" q={planet.insolationEarth} unit="× Earth" />
          </dl>
          <h3 className="pip__sub">Host star</h3>
          <dl className="pip__list">
            <TextRow label="Name" value={star.name} />
            <TextRow label="Spectral type" value={star.spectralType} />
            <MeasurementRow label="Effective temperature" q={star.teff} unit="K" />
            <MeasurementRow label="Mass" q={star.massSun} unit="M☉" />
            <MeasurementRow label="Radius" q={star.radiusSun} unit="R☉" />
            <MeasurementRow
              label="Distance from Earth"
              q={planet.system?.distancePc}
              unit="pc"
              secondary={distanceLy ? `≈ ${sig(distanceLy.value)} light-years` : undefined}
            />
          </dl>
          <h3 className="pip__sub">Discovery</h3>
          <dl className="pip__list">
            <TextRow label="Method" value={planet.discovery?.method} />
            <TextRow label="Year" value={planet.discovery?.year ? String(planet.discovery.year) : null} />
            <TextRow label="Facility" value={planet.discovery?.facility} />
          </dl>
        </div>
      </div>

      <div className="pip__actions">
        <button
          type="button"
          className="pip__toggle"
          aria-expanded={expanded}
          aria-controls={`pip-more-${planet.id}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'View more'}
          <ChevronDown size={14} className={expanded ? 'is-flipped' : undefined} aria-hidden="true" />
        </button>
        <Link to={profileHref} className="pip__link">
          Open planet
        </Link>
      </div>
    </aside>
  )
}
