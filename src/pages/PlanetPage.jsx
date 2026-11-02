// owner: UI (D2.4). Immersive planet profile over the store's catalog.
// Template lives in pages/planet/PlanetProfile.jsx (shared with /lab/profile).
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { MAX_COMPARE, useCelestria } from '../store/useCelestria.js'
import { catalogMessage } from './catalogMessages.js'
import PlanetProfile from './planet/PlanetProfile.jsx'

export default function PlanetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const indexPlanet = useCelestria((s) => s.byId[id])
  const detail = useCelestria((s) => s.details[id])
  const loadDetail = useCelestria((s) => s.loadDetail)
  const reducedMotion = useCelestria((s) => s.reducedMotion)
  const compareIds = useCelestria((s) => s.compareIds)
  const addCompare = useCelestria((s) => s.addCompare)
  // The index has values and provenance; the full record adds uncertainties
  // and sources, so it replaces the index planet once loaded.
  const planet = detail ?? indexPlanet

  useEffect(() => {
    if (indexPlanet) loadDetail(id)
  }, [id, indexPlanet, loadDetail])

  if (!planet) {
    const msg = catalogMessage({ status, id })
    return (
      <PagePlaceholder title={msg.title ?? 'Planet profile'}>
        <p>{msg.message}</p>
        {msg.kind === 'notFound' && <Link to="/viewport">Browse confirmed planets</Link>}
      </PagePlaceholder>
    )
  }

  return (
    <PlanetProfile
      planet={planet}
      planets={planets}
      planetHref={(pid) => `/planet/${pid}`}
      systemHref={(host) => `/explore/${encodeURIComponent(host)}`}
      orbitHref={(pid) => `/planet/${pid}/orbit`}
      sunfallHref={(pid) => `/planet/${pid}/sunfall`}
      closeHref={`/explore/${encodeURIComponent(planet.host)}`}
      onSelectPlanet={(pid) => navigate(`/planet/${pid}`)}
      reducedMotion={reducedMotion}
      compare={{ ids: compareIds, max: MAX_COMPARE, href: `/compare?ids=${compareIds.join(',')}`, onAdd: addCompare }}
    />
  )
}
