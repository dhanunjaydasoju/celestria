// /orbit — owner: LEAD. Entry point from the menu: opens the Orbital
// Simulator for a default planet (HD 80606 b, the most eccentric showcase,
// else the first catalog planet). Each simulator has its own planet route.
import { Navigate } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'

const DEFAULT_ID = 'hd-80606-b'

export default function OrbitIndexPage() {
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const byId = useCelestria((s) => s.byId)

  if (status === 'ready' && planets.length) {
    const id = byId[DEFAULT_ID] ? DEFAULT_ID : planets[0].id
    return <Navigate to={`/planet/${id}/orbit`} replace />
  }
  return (
    <PagePlaceholder title="Orbital simulator" owner="LEAD" deliverable="M3 Orbital Simulator">
      <p>
        {status === 'ready'
          ? 'No planets in the catalog yet. The live NASA catalog arrives with D3.4.'
          : 'Loading catalog…'}
      </p>
    </PagePlaceholder>
  )
}
