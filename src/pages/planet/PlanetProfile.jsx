// Immersive planet profile — owner: UI (D2.4; implemented by LEAD on request).
// Left: interactive PlanetViewport. Right: key features by default; "View
// more" reveals every other catalog value. All with uncertainty, unit and
// provenance. One template for every planet; all
// content comes from the Planet object. Used by PlanetPage (store catalog)
// and /lab/profile (lab fixtures).

import { ArrowLeft, ArrowRight, ChevronDown, Orbit, Telescope, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import MeasurementRow from '../../components/data/MeasurementRow.jsx'
import PlanetPicker from '../../components/ui/PlanetPicker.jsx'
import { FEATURED_PLANET_IDS } from '../../data/featured.js'
import ProvenanceBadge from '../../components/data/ProvenanceBadge.jsx'
import { sourceLabel } from '../../components/data/sourceLabel.js'
import { isScientific, scienceValue } from '../../contracts/planet.js'
import {
  distanceLightYears,
  isFixedCircular,
  isModelBasedImaging,
  orbitalExtremes,
  surfaceGravity,
} from '../../science/derived.js'
import { visualParams } from '../../three/planet/visualParams.js'
import { describeBasis, sig } from '../../three/shared/format.js'
import PlanetViewport from '../../three/viewports/PlanetViewport.jsx'
import HabitabilityPanel from '../../components/habitability/HabitabilityPanel.jsx'
import './PlanetProfile.css'

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

function Section({ title, children }) {
  return (
    <section className="pp-section">
      <h2 className="pp-section__title">{title}</h2>
      <dl className="pp-section__list">{children}</dl>
    </section>
  )
}

/** Unique source citations with the fields that use them. */
function collectSources(planet) {
  const entries = [
    ['Radius', planet.radiusEarth],
    ['Mass', planet.massEarth],
    ['Density', planet.densityGcc],
    ['Equilibrium temperature', planet.eqTempK],
    ['Insolation', planet.insolationEarth],
    ['Orbital period', planet.periodDays],
    ['Semi-major axis', planet.semiMajorAxisAU],
    ['Eccentricity', planet.eccentricity],
    ['Inclination', planet.inclinationDeg],
    ['Argument of periastron', planet.periastronArgDeg],
    ['Time of periastron', planet.periastronTimeJD],
    ['Transit midpoint', planet.transitMidJD],
    ['Star temperature', planet.star?.teff],
    ['Star radius', planet.star?.radiusSun],
    ['Star mass', planet.star?.massSun],
    ['Star luminosity', planet.star?.lumLog],
    ['Star metallicity', planet.star?.metallicity],
    ['Star age', planet.star?.ageGyr],
    ['Distance', planet.system?.distancePc],
  ]
  const map = new Map()
  for (const [field, q] of entries) {
    if (!isScientific(q) || !q.source?.label) continue
    const key = `${q.source.label}|${q.source.url ?? ''}`
    if (!map.has(key)) map.set(key, { ...q.source, fields: [] })
    map.get(key).fields.push(field)
  }
  return [...map.values()].sort((a, b) => b.fields.length - a.fields.length)
}

const MISSING = { value: null, status: 'missing' }

/**
 * @param {Object} props
 * @param {import('../../contracts/planet.js').Planet} props.planet
 * @param {import('../../contracts/planet.js').Planet[]} props.planets   navigation order
 * @param {(id: string) => string} props.planetHref
 * @param {(host: string) => string} props.systemHref
 * @param {(id: string) => string} props.orbitHref
 * @param {string} props.closeHref
 * @param {(id: string) => void} props.onSelectPlanet
 * @param {boolean} [props.reducedMotion]
 */
export default function PlanetProfile({
  planet,
  planets,
  planetHref,
  systemHref,
  orbitHref,
  closeHref,
  onSelectPlanet,
  reducedMotion = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const params = useMemo(() => visualParams(planet), [planet])
  const gravity = useMemo(() => surfaceGravity(planet), [planet])
  const extremes = useMemo(() => orbitalExtremes(planet), [planet])
  const distanceLy = useMemo(() => distanceLightYears(planet.system?.distancePc), [planet])
  const sources = useMemo(() => collectSources(planet), [planet])

  const index = planets.findIndex((p) => p.id === planet.id)
  const prev = index > 0 ? planets[index - 1] : planets.at(-1)
  const next = index >= 0 && index < planets.length - 1 ? planets[index + 1] : planets[0]

  const star = planet.star ?? {}
  const d = planet.discovery ?? {}
  const siblings = planets.filter((p) => p.host === planet.host).length
  const hasPeriod = scienceValue(planet.periodDays) != null
  const periodDays = scienceValue(planet.periodDays)
  const yearLine =
    periodDays == null
      ? null
      : periodDays < 2
        ? `${sig(periodDays * 24)} hours`
        : periodDays < 730
          ? `${sig(periodDays)} days`
          : `${sig(periodDays / 365.25)} years`

  const imaged = isModelBasedImaging(planet)
  const fixedCircular = isFixedCircular(planet.eccentricity)
  const massReason = imaged
    ? 'Mass and radius of a directly imaged planet come from evolutionary models'
    : 'Requires a measured true mass and a measured radius'
  const extremesReason = fixedCircular
    ? 'Eccentricity was fixed at 0 in the source fit, so these would only restate the assumption'
    : !isScientific(planet.eccentricity)
      ? 'Requires a catalog eccentricity'
      : 'Requires a catalog semi-major axis'
  const modelNote = imaged ? 'Model-based: derived from evolutionary models (directly imaged planet)' : undefined
  const withBasis = (q, basis) => (basis && isScientific(q) ? { ...q, basis } : q)

  return (
    <div className="pp">
      <section className="pp-visual" aria-label={`3D view of ${planet.name}`}>
        <PlanetViewport planet={planet} size="hero" autoRotate={!reducedMotion} />
        <div key={planet.id} className="pp-visual__fade" aria-hidden="true" />
        <div className="pp-visual__picker">
          <PlanetPicker planets={planets} value={planet.id} onChange={onSelectPlanet} featuredIds={FEATURED_PLANET_IDS} />
        </div>
      </section>

      <article className="pp-info">
        <div className="pp-nav">
          <div className="pp-nav__steps">
            <Link to={planetHref(prev.id)} className="pp-iconbtn" aria-label={`Previous planet: ${prev.name}`} title={prev.name}>
              <ArrowLeft size={15} />
            </Link>
            <Link to={planetHref(next.id)} className="pp-iconbtn" aria-label={`Next planet: ${next.name}`} title={next.name}>
              <ArrowRight size={15} />
            </Link>
          </div>
          <Link to={closeHref} className="pp-iconbtn pp-close" aria-label="Close profile">
            <X size={16} />
          </Link>
        </div>

        <div key={planet.id} className="pp-content">
          <header className="pp-head">
            <p className="pp-kicker">
              {d.method ?? 'Discovery method unknown'}
              {d.year && <span> · {d.year}</span>}
            </p>
            <h1 className="pp-title">{planet.name}</h1>
            <p className="pp-host">
              Orbits <strong>{planet.host}</strong>
              {star.spectralType && <>, a {star.spectralType} star</>}
              {yearLine && <> · one orbit every {yearLine}</>}
            </p>
            <ul className="pp-tags">
              <li title="Visual size class from radius (or mass) thresholds; not a measured composition">
                {params.archetypeLabel}
                {params.sizeBasis && <span>{describeBasis(params.sizeBasis)}</span>}
              </li>
              <li title="Temperature band from equilibrium temperature (or insolation)">
                {params.thermalLabel}
                {params.thermalBasis && <span>{describeBasis(params.thermalBasis)}</span>}
              </li>
            </ul>
            <div className="pp-actions">
              <Link to={systemHref(planet.host)} className="pp-btn pp-btn--primary">
                <Telescope size={15} /> Explore the {planet.host} system
                {siblings > 1 && <span className="pp-btn__count">{siblings}</span>}
              </Link>
              {hasPeriod ? (
                <Link to={orbitHref(planet.id)} className="pp-btn">
                  <Orbit size={15} /> Orbital simulator
                </Link>
              ) : (
                <span className="pp-btn is-disabled" title="Requires an orbital period">
                  <Orbit size={15} /> Orbital simulator unavailable
                </span>
              )}
            </div>
          </header>

          <Section title="Key features">
            <TextRow label="Planet name" value={planet.name} />
            <TextRow
              label="Planet type"
              value={`${params.archetypeLabel}${params.thermal !== 'unknown' ? ` · ${params.thermalLabel}` : ''}`}
              note={params.sizeBasis ? `Visual class from ${describeBasis(params.sizeBasis)}` : undefined}
            />
            <MeasurementRow label="Radius" q={withBasis(planet.radiusEarth, modelNote)} unit="R⊕" />
            <MeasurementRow
              label={planet.massEarth?.kind === 'Msini' ? 'Mass (M sin i)' : 'Mass'}
              q={withBasis(
                planet.massEarth,
                planet.massEarth?.kind === 'M-R' ? "Estimated from NASA's mass–radius relation" : modelNote,
              )}
              unit="M⊕"
            />
            <MeasurementRow label="Orbital period" q={planet.periodDays} unit="days" />
            <MeasurementRow label="Semi-major axis" q={planet.semiMajorAxisAU} unit="AU" />
            <MeasurementRow label="Equilibrium temperature" q={planet.eqTempK} unit="K" />
          </Section>

          <HabitabilityPanel planet={planet} />

          <button
            type="button"
            className="pp-toggle"
            aria-expanded={expanded}
            aria-controls="pp-details"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'View more'}
            <ChevronDown size={15} className={expanded ? 'is-flipped' : undefined} aria-hidden="true" />
          </button>

          <div id="pp-details" className={`pp-expand${expanded ? ' is-open' : ''}`} aria-hidden={!expanded} inert={!expanded}>
            <div className="pp-expand__inner">
              <Section title="Planet properties">
                <MeasurementRow label="Density" q={planet.densityGcc} unit="g/cm³" />
                <MeasurementRow
                  label="Surface gravity"
                  q={gravity}
                  unit="m/s²"
                  secondary={gravity ? `${sig(gravity.earthRatio)} × Earth` : undefined}
                  unavailableReason={massReason}
                />
                <MeasurementRow label="Insolation" q={planet.insolationEarth} unit="× Earth" />
                <MeasurementRow label="Atmosphere" q={MISSING} unavailableReason="Composition is not part of the NASA catalog" />
              </Section>

              <Section title="Orbital properties">
                <MeasurementRow
                  label="Eccentricity"
                  q={
                    fixedCircular
                      ? { ...planet.eccentricity, assumed: true, basis: 'Fixed at 0 (circular orbit) in the source fit; not measured' }
                      : planet.eccentricity
                  }
                />
                <MeasurementRow label="Inclination" q={planet.inclinationDeg} unit="°" />
                <MeasurementRow label="Periastron" q={extremes?.periastron ?? null} unit="AU" unavailableReason={extremesReason} />
                <MeasurementRow label="Apoastron" q={extremes?.apoastron ?? null} unit="AU" unavailableReason={extremesReason} />
                <MeasurementRow label="Argument of periastron" q={planet.periastronArgDeg} unit="°" />
                <MeasurementRow label="Time of periastron" q={planet.periastronTimeJD} unit="BJD" />
                <MeasurementRow label="Transit midpoint" q={planet.transitMidJD} unit="BJD" />
              </Section>

              <Section title="Host star">
                <TextRow label="Name" value={star.name} />
                <TextRow label="Spectral type" value={star.spectralType} />
                <MeasurementRow label="Effective temperature" q={star.teff} unit="K" />
                <MeasurementRow label="Mass" q={star.massSun} unit="M☉" />
                <MeasurementRow label="Radius" q={star.radiusSun} unit="R☉" />
                <MeasurementRow label="Luminosity" q={star.lumLog} unit="log L/L☉" />
                <MeasurementRow label="Metallicity" q={star.metallicity} unit="[Fe/H] dex" />
                <MeasurementRow label="Age" q={star.ageGyr} unit="Gyr" />
              </Section>

              <Section title="Discovery & system">
                <TextRow label="Year" value={d.year ? String(d.year) : null} />
                <TextRow label="Method" value={d.method} />
                <TextRow label="Facility" value={d.facility} />
                <TextRow label="Instrument" value={d.telescope} />
                <MeasurementRow
                  label="Distance from Earth"
                  q={planet.system?.distancePc}
                  unit="pc"
                  secondary={distanceLy ? `≈ ${sig(distanceLy.value)} light-years` : undefined}
                />
                <TextRow label="Stars in system" value={planet.system?.starCount != null ? String(planet.system.starCount) : null} />
                <TextRow label="Known planets in system" value={planet.system?.planetCount != null ? String(planet.system.planetCount) : null} />
              </Section>

              <section className="pp-section">
                <h2 className="pp-section__title">Sources &amp; methods ({sources.length})</h2>
                <ul className="pp-sources">
                  {sources.map((s) => (
                    <li key={`${s.label}${s.url}`}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {sourceLabel(s)}
                        </a>
                      ) : (
                        sourceLabel(s)
                      )}
                      <span>{s.fields.join(', ')}</span>
                    </li>
                  ))}
                </ul>
                <p className="pp-method">
                  Values come from the NASA Exoplanet Archive&apos;s Planetary Systems Composite Parameters table, which
                  can combine results from different publications. Surface gravity, periastron, apoastron and
                  light-year distance are calculated by CELESTRIA from catalog values, using the formula shown beside
                  each.
                </p>
              </section>
            </div>
          </div>

          <p className="pp-note">
            The 3D planet is an artistic impression based on {params.coverage.available} of {params.coverage.total} key
            measurements. No telescope has resolved this world&apos;s surface.
            {planet.flags?.controversial && ' The NASA archive flags this planet as controversial.'}
          </p>
        </div>
      </article>
    </div>
  )
}
