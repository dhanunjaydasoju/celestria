// owner: LEAD (M2). Hosts the system explorer over the store's catalog.
import { useNavigate, useParams } from 'react-router'
import PagePlaceholder from '../layout/PagePlaceholder.jsx'
import { useCelestria } from '../store/useCelestria.js'
import SystemExplorer from './explore/SystemExplorer.jsx'

export default function ExplorePage() {
  const { host } = useParams()
  const navigate = useNavigate()
  const status = useCelestria((s) => s.catalogStatus)
  const planets = useCelestria((s) => s.planets)
  const reducedMotion = useCelestria((s) => s.reducedMotion)

  if (status !== 'ready' || planets.length === 0) {
    return (
      <PagePlaceholder title="Explore" owner="LEAD" deliverable="M2 System viewer">
        <p>
          {status === 'error'
            ? 'The catalog could not be loaded.'
            : status === 'ready'
              ? 'No planets in the catalog yet. The live NASA catalog arrives with D3.4.'
              : 'Loading catalog…'}
        </p>
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
    />
  )
}
