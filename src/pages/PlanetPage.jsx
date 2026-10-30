// owner: UI (D2.4). Immersive planet profile over the store's catalog.
// Template lives in pages/planet/PlanetProfile.jsx (shared with /lab/profile).
import { useNavigate, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import PlanetProfile from './planet/PlanetProfile.jsx'

export default function PlanetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const planet = useCelestria((s) => s.byId[id])
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  if (!planet) {
    return (
      <PagePlaceholder title="Planet profile" owner="UI" deliverable="D2.4 Planet profile">
        <p>
          {status === 'loading' || status === 'idle'
            ? 'Loading catalog…'
            : `No planet with id "${id}" in the catalog. The live NASA catalog arrives with D3.4.`}
        </p>
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
      closeHref={`/explore/${encodeURIComponent(planet.host)}`}
      onSelectPlanet={(pid) => navigate(`/planet/${pid}`)}
      reducedMotion={reducedMotion}
    />
  )
}
