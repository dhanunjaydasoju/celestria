// Planet Viewport (/viewport/:id) — owner: LEAD. A focused, full-screen 3D
// view of one planet with the planet picker. Default planet when no id is
// given: Kepler-452 b if present, else the first catalog planet.

import { ArrowRight } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import PlanetPicker from '../../components/ui/PlanetPicker.jsx'
import { FEATURED_PLANET_IDS } from '../../data/featured.js'
import PagePlaceholder from '../../layout/PagePlaceholder.jsx'
import { useCelestria } from '../../store/useCelestria.js'
import PlanetViewport from '../../three/viewports/PlanetViewport.jsx'
import './PlanetViewportPage.css'

const DEFAULT_ID = 'kepler-452-b'

export default function PlanetViewportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const byId = useCelestria((s) => s.byId)
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  if (status !== 'ready' || planets.length === 0) {
    return (
      <PagePlaceholder title="Planet Viewport" owner="LEAD" deliverable="Planet Viewport">
        <p>
          {status === 'ready'
            ? 'No planets in the catalog yet. The live NASA catalog arrives with D3.4.'
            : 'Loading catalog…'}
        </p>
      </PagePlaceholder>
    )
  }
  if (!id) return <Navigate to={`/viewport/${byId[DEFAULT_ID] ? DEFAULT_ID : planets[0].id}`} replace />
  const planet = byId[id]
  if (!planet) return <Navigate to="/viewport" replace />

  return (
    <section className="pvp" aria-label={`Planet Viewport: ${planet.name}`}>
      <PlanetViewport planet={planet} size="hero" autoRotate={!reducedMotion} />
      <div key={planet.id} className="pvp__fade" aria-hidden="true" />
      <div className="pvp__bar">
        <PlanetPicker planets={planets} value={planet.id} onChange={(pid) => navigate(`/viewport/${pid}`)} featuredIds={FEATURED_PLANET_IDS} />
        <Link to={`/planet/${planet.id}`} className="pvp__profile">
          Planet profile <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  )
}
