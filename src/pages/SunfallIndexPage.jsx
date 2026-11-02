// /sunfall — owner: LEAD (SUNFALL S4). Menu entry point: opens SUNFALL for a
// featured planet with a measured radius (Kepler-16 b, else the first
// featured planet that has one, else the first catalogue planet). Each
// planet has its own route, /planet/:id/sunfall.
import { Navigate } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import { catalogMessage } from './catalogMessages.js'
import { defaultSunfallId } from './sunfall/sunfallPage.js'

export default function SunfallIndexPage() {
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const byId = useCelestria((s) => s.byId)

  const id = status === 'ready' ? defaultSunfallId(byId, planets) : null
  if (id) return <Navigate to={`/planet/${id}/sunfall`} replace />
  const msg = catalogMessage({ status })
  return (
    <PagePlaceholder title={msg.title ?? 'SUNFALL'}>
      <p>{msg.message}</p>
    </PagePlaceholder>
  )
}
