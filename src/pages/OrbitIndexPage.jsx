// /orbit — owner: LEAD. Entry point from the menu: opens the Orbital
// Simulator for a default planet (HD 80606 b, the most eccentric showcase,
// else the first catalog planet). Each simulator has its own planet route.
import { Navigate } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import { catalogMessage } from './catalogMessages.js'

const DEFAULT_ID = 'hd-80606-b'

export default function OrbitIndexPage() {
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const byId = useCelestria((s) => s.byId)

  if (status === 'ready' && planets.length) {
    const id = byId[DEFAULT_ID] ? DEFAULT_ID : planets[0].id
    return <Navigate to={`/planet/${id}/orbit`} replace />
  }
  const msg = catalogMessage({ status })
  return (
    <PagePlaceholder title={msg.title ?? 'Orbital simulator'}>
      <p>{msg.message}</p>
    </PagePlaceholder>
  )
}
