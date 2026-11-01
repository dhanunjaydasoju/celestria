// owner: LEAD (M2). Hosts the system explorer over the store's catalog.
import { useNavigate, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import { catalogMessage } from './catalogMessages.js'
import SystemExplorer from './explore/SystemExplorer.jsx'

export default function ExplorePage() {
  const { host } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const reducedMotion = useCelestria((s) => s.reducedMotion)
  const setPageFocus = useCelestria((s) => s.setPageFocus)

  if (status !== 'ready' || planets.length === 0) {
    const msg = catalogMessage({ status })
    return (
      <PagePlaceholder title={msg.title ?? 'Explore'}>
        <p>{msg.message}</p>
      </PagePlaceholder>
    )
  }

  return (
    <SystemExplorer
      planets={planets}
      host={host ? decodeURIComponent(host) : undefined}
      onHostChange={(h) => navigate(`/explore/${encodeURIComponent(h)}`)}
      profileHref={(id) => `/planet/${id}`}
      reducedMotion={reducedMotion}
      onFocusChange={setPageFocus}
    />
  )
}
