// /planet/:id/sunfall — owner: LEAD (SUNFALL S4). How many copies of a
// planet equal the Sun's volume, for any catalogue planet. The planet comes
// from the store's catalogue and its full record (uncertainties, sources)
// from loadDetail; the result from src/science/sunfall.js; the scene from
// SunfallViewport (Sun, swarm, hero inset, counter and controls). The
// header's Ask the Astronomer button gets this planet as page context.

import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import ProvenanceBadge from '../components/data/ProvenanceBadge.jsx'
import PlanetPicker from '../components/ui/PlanetPicker.jsx'
import { FEATURED_PLANET_IDS } from '../data/featured.js'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { sunfallResult } from '../science/sunfall.js'
import { useCelestria } from '../store/useCelestria.js'
import SunfallViewport from '../three/viewports/SunfallViewport.jsx'
import { catalogMessage } from './catalogMessages.js'
import { radiusSummary } from './sunfall/sunfallPage.js'
import './sunfall/SunfallPage.css'

export default function SunfallPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const indexPlanet = useCelestria((s) => s.byId[id])
  const detail = useCelestria((s) => s.details[id])
  const detailStatus = useCelestria((s) => s.detailStatus[id])
  const loadDetail = useCelestria((s) => s.loadDetail)
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  useEffect(() => {
    if (indexPlanet) loadDetail(id)
  }, [id, indexPlanet, loadDetail])

  // The result's precision depends on the radius uncertainty, which only the
  // full record carries: wait for it (fall back to the index on error), so
  // the animation does not restart when it arrives.
  const planet = detail ?? (detailStatus === 'error' ? indexPlanet : null)
  const result = useMemo(() => (planet ? { planetName: planet.name, ...sunfallResult(planet) } : null), [planet])
  const radius = radiusSummary(result)

  if (!indexPlanet) {
    const msg = catalogMessage({ status, id })
    return (
      <PagePlaceholder title={msg.title ?? 'SUNFALL'}>
        <p>{msg.message}</p>
        {msg.kind === 'notFound' && <Link to="/sunfall">Open SUNFALL for a featured planet</Link>}
      </PagePlaceholder>
    )
  }

  const name = indexPlanet.name
  return (
    <div className="sf">
      <header className="sf-bar">
        <Link to={`/planet/${id}`} className="sf-back">
          <ArrowLeft size={14} aria-hidden="true" /> Profile
        </Link>
        <h1 className="sf-title">
          <span className="sf-kicker">SUNFALL</span> {name}
        </h1>
        <div className="sf-picker">
          <PlanetPicker
            planets={planets}
            value={id}
            onChange={(pid) => navigate(`/planet/${pid}/sunfall`)}
            featuredIds={FEATURED_PLANET_IDS}
            label="Choose a planet for SUNFALL"
          />
        </div>
        <p className={`sf-radius${radius.available ? '' : ' is-missing'}`}>
          <span className="sf-radius__label">Radius</span>
          {planet ? (
            <>
              <span className="sf-radius__value num">{radius.text}</span>
              <ProvenanceBadge kind={radius.kind} title={radius.provenance ?? undefined} />
            </>
          ) : (
            <span className="sf-radius__value">Loading…</span>
          )}
        </p>
      </header>

      {detailStatus === 'error' && (
        <p className="sf-notice" role="status">
          The full record for {name} could not be loaded, so the radius uncertainty is not shown and the result is given to 3 significant figures.
        </p>
      )}

      <div className="sf-stage">
        {planet ? (
          <SunfallViewport key={planet.id} planet={planet} result={result} reducedMotion={reducedMotion} />
        ) : (
          <p className="sf-loading" role="status">
            Loading {name}…
          </p>
        )}
      </div>
    </div>
  )
}
